import type { SignTransactionRequest } from "@1claw/sdk";

/**
 * Toy "solver output" — in production, CoW Swap / UniswapX / an ERC-7683
 * relayer would return calldata + router address after matching your intent.
 * Here we only shape the same fields the 1Claw Intents API expects.
 */
export type SolverFillPlan = {
  /** Human-readable trace of what a solver might have matched */
  narrative: string;
  /** Fields passed through to 1Claw signing (EVM tx intent) */
  tx: SignTransactionRequest;
};

/**
 * Simulates: user wants "best execution on testnet"; solver responds with
 * a concrete EVM transaction (here: zero-value no-op to DEMO_TO or burn).
 */
export function mockSolverFillPlan(opts: {
  chain: string;
  /** Recipient — use an address on your agent's tx_to_allowlist if set */
  to: string;
}): SolverFillPlan {
  const { chain, to } = opts;
  return {
    narrative:
      "[mock solver] Matched route: no-op calldata (value 0) — replace with real " +
      "router + swap calldata from CoW / UniswapX / ERC-7683 settlement in production.",
    tx: {
      chain,
      to,
      value: "0",
      data: "0x",
      signing_key_path: `keys/${chain}-signer`,
    },
  };
}
