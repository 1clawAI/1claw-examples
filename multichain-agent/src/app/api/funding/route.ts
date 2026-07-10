import { NextResponse } from "next/server";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import {
  fetchBalance,
  requestProgrammaticFaucet,
} from "@/lib/funding";
import {
  isAgentConfigured,
  listSigningKeys,
  getSigningKeyBalance,
} from "@/lib/oneclaw";

export async function GET() {
  if (!isAgentConfigured()) {
    return NextResponse.json({ configured: false, chains: [] });
  }

  try {
    const keys = await listSigningKeys();
    const byChain = Object.fromEntries(
      keys.filter((k) => k.is_active !== false).map((k) => [k.chain, k]),
    );

    const chains = await Promise.all(
      SUPPORTED_CHAINS.map(async (cfg) => {
        const key = byChain[cfg.signingKeyChain];
        if (!key?.address) {
          return {
            key: cfg.key,
            label: cfg.label,
            testnetChain: cfg.testnetChain,
            nativeSymbol: cfg.nativeSymbol,
            faucet: cfg.faucet,
            unit: cfg.nativeSymbol,
            balanceError: "Not provisioned",
            canAutoFund: cfg.key === "xrp" || cfg.key === "solana",
          };
        }

        // Call the 1Claw balance API with the testnet chain name.
        // This correctly derives the testnet address from the stored public key.
        let address = key.address;
        let balance: string | undefined;
        let balanceError: string | undefined;
        let unit = cfg.nativeSymbol;

        try {
          const bal = (await getSigningKeyBalance(cfg.testnetChain)) as Record<
            string,
            unknown
          >;
          if (bal.address && typeof bal.address === "string") {
            address = bal.address;
          }
          if (bal.balance_display && typeof bal.balance_display === "string") {
            balance = bal.balance_display;
          } else if (bal.message && typeof bal.message === "string") {
            // API returned a message instead of a balance; fall back to direct
            const fb = await fetchBalance(cfg.key, address);
            balance = fb.balance;
            balanceError = fb.error;
            unit = fb.unit;
          }
        } catch {
          // 1Claw balance API failed; fall back to direct external API
          const fb = await fetchBalance(cfg.key, address);
          balance = fb.balance;
          balanceError = fb.error;
          unit = fb.unit;
        }

        return {
          key: cfg.key,
          label: cfg.label,
          testnetChain: cfg.testnetChain,
          nativeSymbol: cfg.nativeSymbol,
          address,
          displayAddress: address,
          faucet: cfg.faucet,
          explorerAddress: cfg.explorerAddress(address),
          balance,
          balanceError,
          unit,
          canAutoFund: cfg.key === "xrp" || cfg.key === "solana",
        };
      }),
    );

    return NextResponse.json({ configured: true, chains });
  } catch (e) {
    return NextResponse.json(
      { configured: false, error: String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!isAgentConfigured()) {
    return NextResponse.json({ error: "Agent not configured" }, { status: 400 });
  }

  const { chain } = (await req.json()) as { chain?: string };
  if (!chain) {
    return NextResponse.json({ error: "chain required" }, { status: 400 });
  }

  const cfg = SUPPORTED_CHAINS.find((c) => c.key === chain);
  if (!cfg) {
    return NextResponse.json({ error: "Unknown chain" }, { status: 400 });
  }

  const keys = await listSigningKeys();
  const address = keys.find((k) => k.chain === cfg.signingKeyChain)?.address;
  if (!address) {
    return NextResponse.json({ error: "No signing key for chain" }, { status: 404 });
  }

  const result = await requestProgrammaticFaucet(cfg.key, address);
  return NextResponse.json(result);
}
