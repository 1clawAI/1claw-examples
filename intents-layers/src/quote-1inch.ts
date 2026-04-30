import type { SignTransactionRequest } from "@1claw/sdk";
import type { SolverFillPlan } from "./mock-solver.js";

/** Map chain id → 1Claw `chain` name + default signing key path segment */
export function chainIdToClawChain(chainId: number): string {
  const m: Record<number, string> = {
    1: "ethereum",
    11155111: "sepolia",
    8453: "base",
    84532: "base-sepolia",
    42161: "arbitrum-one",
    10: "optimism",
    137: "polygon",
  };
  const name = m[chainId];
  if (!name) throw new Error(`Unsupported CHAIN_ID ${chainId} for 1Claw Intents (add mapping in quote-1inch.ts)`);
  return name;
}

/** 1inch uses this placeholder for native ETH on swap side */
export const ONEINCH_ETH_PLACEHOLDER = "0xEeeeeEeeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function weiHexOrDecToEthDecimal(value: string): string {
  const v = value.trim();
  if (!v || v === "0x" || v === "0x0") return "0";
  const wei = v.startsWith("0x") || v.startsWith("0X") ? BigInt(v) : BigInt(v);
  if (wei === 0n) return "0";
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = wei % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "") || "0";
  return `${whole}.${fracStr}`;
}

type OneinchSwapTx = {
  to: string;
  data: string;
  value?: string;
  gas?: number | string;
  gasPrice?: string;
};

type OneinchSwapResponse = {
  tx?: OneinchSwapTx;
};

/**
 * Live **aggregator** route (1inch Swap API) → same `SignTransactionRequest` shape
 * as a CoW / UniswapX *settlement* would eventually produce for the wallet to sign.
 *
 * CoW / ERC-7683 flows often sign **orders** (EIP-712) first; the **solver** still ends
 * up broadcasting an EVM tx with `(to, data, value)` — that is what we fetch here from 1inch.
 *
 * @see https://portal.1inch.dev/documentation/swap
 */
export async function fetch1inchSwapPlan(opts: {
  apiKey: string;
  chainId: number;
  /** Signer address (must match the key at `keys/{chain}-signer`) */
  from: string;
  src: string;
  dst: string;
  /** Sell amount in smallest units (wei for ETH) */
  amount: string;
  slippagePercent: number;
}): Promise<SolverFillPlan> {
  const { apiKey, chainId, from, src, dst, amount, slippagePercent } = opts;
  const clawChain = chainIdToClawChain(chainId);

  const url = new URL(`https://api.1inch.dev/swap/v6.0/${chainId}/swap`);
  url.searchParams.set("src", src);
  url.searchParams.set("dst", dst);
  url.searchParams.set("amount", amount);
  url.searchParams.set("from", from);
  url.searchParams.set("slippage", String(slippagePercent));
  url.searchParams.set("disableEstimate", "false");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  const raw = (await res.json()) as OneinchSwapResponse & { description?: string; error?: string };

  if (!res.ok) {
    const msg = raw.description ?? raw.error ?? JSON.stringify(raw).slice(0, 400);
    throw new Error(`1inch swap API HTTP ${res.status}: ${msg}`);
  }

  const tx = raw.tx;
  if (!tx?.to || !tx.data) throw new Error("1inch response missing tx.to / tx.data");

  const valueEth = weiHexOrDecToEthDecimal(tx.value ?? "0");
  const gasLimit =
    typeof tx.gas === "number"
      ? tx.gas
      : typeof tx.gas === "string"
        ? parseInt(tx.gas, 10)
        : undefined;

  const out: SignTransactionRequest = {
    chain: clawChain,
    to: tx.to,
    value: valueEth,
    data: tx.data.startsWith("0x") ? tx.data : `0x${tx.data}`,
    signing_key_path: `keys/${clawChain}-signer`,
  };
  if (gasLimit && !Number.isNaN(gasLimit)) {
    out.gas_limit = gasLimit;
  }

  return {
    narrative:
      `[1inch Swap API] chainId=${chainId} (${clawChain}) — aggregated route ` +
      `(src=${src.slice(0, 10)}… → dst=${dst.slice(0, 10)}…, amount=${amount}). ` +
      "Same payload shape a CoW / UniswapX relayer would ask your wallet to sign after matching.",
    tx: out,
  };
}
