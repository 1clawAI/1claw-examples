import { NextResponse } from "next/server";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import {
  displayAddress,
  fetchBalance,
  requestProgrammaticFaucet,
} from "@/lib/funding";
import { isAgentConfigured, listSigningKeys } from "@/lib/oneclaw";

export async function GET() {
  if (!isAgentConfigured()) {
    return NextResponse.json({ configured: false, chains: [] });
  }

  try {
    const keys = await listSigningKeys();
    const byChain = Object.fromEntries(
      keys.filter((k) => k.is_active !== false).map((k) => [k.chain, k.address]),
    );

    const chains = await Promise.all(
      SUPPORTED_CHAINS.map(async (cfg) => {
        const address = byChain[cfg.signingKeyChain];
        const display = address ? displayAddress(cfg.key, address) : undefined;
        const balance = address
          ? await fetchBalance(cfg.key, address)
          : { chain: cfg.key, unit: cfg.nativeSymbol, error: "Not provisioned" };

        return {
          key: cfg.key,
          label: cfg.label,
          testnetChain: cfg.testnetChain,
          nativeSymbol: cfg.nativeSymbol,
          address,
          displayAddress: display,
          faucet: cfg.faucet,
          explorerAddress: address ? cfg.explorerAddress(display ?? address) : undefined,
          balance: balance.balance,
          balanceError: balance.error,
          unit: balance.unit,
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
