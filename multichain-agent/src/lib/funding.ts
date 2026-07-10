import { cardanoPreprodAddress, signetDisplayAddress, type ChainKey } from "./chains";

export type BalanceResult = {
  chain: ChainKey;
  balance?: string;
  unit: string;
  error?: string;
};

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchBalance(
  chain: ChainKey,
  address: string,
): Promise<BalanceResult> {
  try {
    switch (chain) {
      case "solana": {
        const r = (await postJson("https://api.devnet.solana.com", {
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address],
        })) as { result?: { value?: number } };
        const lamports = r.result?.value ?? 0;
        return { chain, balance: (lamports / 1e9).toFixed(4), unit: "SOL" };
      }
      case "xrp": {
        const r = (await postJson("https://s.altnet.rippletest.net:51234/", {
          method: "account_info",
          params: [{ account: address, ledger_index: "validated" }],
        })) as { result?: { account_data?: { Balance?: string } } };
        const drops = r.result?.account_data?.Balance ?? "0";
        return { chain, balance: (Number(drops) / 1e6).toFixed(2), unit: "XRP" };
      }
      case "tron": {
        const res = await fetch(
          `https://api.shasta.trongrid.io/v1/accounts/${address}`,
        );
        const d = (await res.json()) as { data?: Array<{ balance?: number }> };
        const sun = d.data?.[0]?.balance ?? 0;
        return { chain, balance: (sun / 1e6).toFixed(2), unit: "TRX" };
      }
      case "ethereum": {
        const sepoliaRpcs = [
          "https://ethereum-sepolia-rpc.publicnode.com",
          "https://1rpc.io/sepolia",
          "https://rpc.sepolia.org",
        ];
        for (const rpcUrl of sepoliaRpcs) {
          try {
            const res = await fetch(rpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_getBalance",
                params: [address, "latest"],
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) continue;
            const r = (await res.json()) as { result?: string };
            if (!r.result) continue;
            const wei = parseInt(r.result, 16);
            return { chain, balance: (wei / 1e18).toFixed(6), unit: "ETH" };
          } catch {
            continue;
          }
        }
        return { chain, unit: "ETH", error: "All Sepolia RPCs unavailable" };
      }
      case "bitcoin": {
        const signetAddr = signetDisplayAddress(address);
        try {
          const res = await fetch(
            `https://mempool.space/signet/api/address/${signetAddr}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (!res.ok) {
            return { chain, unit: "BTC", error: `Mempool API ${res.status}` };
          }
          const d = (await res.json()) as {
            chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
          };
          const funded = d.chain_stats?.funded_txo_sum ?? 0;
          const spent = d.chain_stats?.spent_txo_sum ?? 0;
          const sats = funded - spent;
          return { chain, balance: (sats / 1e8).toFixed(8), unit: "BTC" };
        } catch {
          return { chain, unit: "BTC", error: "Could not reach mempool.space" };
        }
      }
      case "cardano": {
        const preprod = cardanoPreprodAddress(address);
        const key = process.env.BLOCKFROST_PREPROD_KEY;
        if (!key) {
          return {
            chain,
            unit: "ADA",
            error: "Set BLOCKFROST_PREPROD_KEY for Cardano balance checks",
          };
        }
        const res = await fetch(
          `https://cardano-preprod.blockfrost.io/api/v0/addresses/${preprod}`,
          { headers: { project_id: key } },
        );
        if (!res.ok) {
          return { chain, unit: "ADA", error: `Blockfrost ${res.status}` };
        }
        const d = (await res.json()) as {
          amount?: Array<{ unit: string; quantity: string }>;
        };
        const lovelace =
          d.amount?.find((a) => a.unit === "lovelace")?.quantity ?? "0";
        return {
          chain,
          balance: (Number(lovelace) / 1e6).toFixed(2),
          unit: "ADA",
        };
      }
      default:
        return { chain, unit: "?", error: "Unknown chain" };
    }
  } catch (e) {
    return { chain, unit: "?", error: String(e) };
  }
}

export async function requestProgrammaticFaucet(
  chain: ChainKey,
  address: string,
): Promise<{ ok: boolean; message: string }> {
  if (chain === "xrp") {
    const res = await fetch("https://faucet.altnet.rippletest.net/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: address }),
    });
    const text = await res.text();
    return {
      ok: res.ok,
      message: text.slice(0, 200) || (res.ok ? "XRP sent" : "Faucet failed"),
    };
  }
  if (chain === "solana") {
    const r = (await postJson("https://api.devnet.solana.com", {
      jsonrpc: "2.0",
      id: 1,
      method: "requestAirdrop",
      params: [address, 2_000_000_000],
    })) as { result?: string; error?: { message?: string } };
    if (r.result) return { ok: true, message: `Airdrop tx: ${r.result}` };
    return { ok: false, message: r.error?.message ?? "Airdrop failed" };
  }
  return {
    ok: false,
    message: "Use the manual faucet link for this chain",
  };
}

export function displayAddress(chain: ChainKey, address: string): string {
  if (chain === "bitcoin") return signetDisplayAddress(address);
  if (chain === "cardano") return cardanoPreprodAddress(address);
  return address;
}
