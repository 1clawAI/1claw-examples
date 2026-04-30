/**
 * Intents layers — solver-shaped plan → 1Claw signing intent (agent → HSM/TEE).
 *
 * See README.md for how this differs from CoW / ERC-7683 "order intents".
 */
import { createClient, type SignTransactionRequest } from "@1claw/sdk";
import { mockSolverFillPlan } from "./mock-solver.js";

const BASE_URL = (process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz").replace(/\/$/, "");
const AGENT_ID = (process.env.ONECLAW_AGENT_ID ?? "").trim();
const AGENT_KEY = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
const DEMO_TO = (process.env.DEMO_TO_ADDRESS ?? "0x0000000000000000000000000000000000000000").trim();

function hasAgentCreds(): boolean {
  return Boolean(
    AGENT_ID &&
      AGENT_KEY &&
      AGENT_ID !== "your-agent-uuid" &&
      !AGENT_KEY.startsWith("ocv_your_"),
  );
}

function printBanner(): void {
  console.log("");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  1Claw example: solver layer + signing layer (two meanings of “intents”)");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("  Layer A — Order / route intents (CoW, UniswapX, ERC-7683, …)");
  console.log("    You declare what outcome you want; solvers compete to produce");
  console.log("    calldata + target contract + value (an *execution plan*).");
  console.log("");
  console.log("  Layer B — Agent → signer intents (1Claw Intents API)");
  console.log("    The agent never holds the private key. It sends chain, to, value,");
  console.log("    data (+ signing_key_path) to Vault/Shroud; guardrails + HSM/TEE sign.");
  console.log("");
  console.log("  This script: mock Layer A output → pass through to Layer B (sign-only).");
  console.log("");
}

async function trySign(plan: SignTransactionRequest): Promise<void> {
  const client = createClient({
    baseUrl: BASE_URL,
    apiKey: AGENT_KEY,
    agentId: AGENT_ID,
  });

  console.log("── Calling 1Claw Intents API (sign-only, no broadcast) ──");
  const res = await client.agents.signTransaction(AGENT_ID, {
    ...plan,
    simulate_first: false,
  });

  if (res.error) {
    console.log("  API error:", res.error.message ?? res.error);
    console.log("");
    console.log(
      "  Hint: ensure the agent has intents_api_enabled, a read policy on the signing key path,",
    );
    console.log("  and that chain / to / value pass tx_allowed_chains, tx_to_allowlist, and caps.");
    process.exitCode = 1;
    return;
  }

  if (res.data) {
    console.log("  ✓ Signed. from:", res.data.from);
    console.log("  ✓ tx_hash (pre-broadcast):", res.data.tx_hash);
    console.log("  ✓ signed_tx (first 42 chars):", res.data.signed_tx.slice(0, 42) + "…");
  }
}

async function main(): Promise<void> {
  printBanner();

  const chain = "sepolia";
  const { narrative, tx } = mockSolverFillPlan({ chain, to: DEMO_TO });

  console.log("── Mock solver (Layer A) output ──");
  console.log(narrative);
  console.log("");
  console.log("Execution plan (JSON) → becomes the body for POST …/transactions/sign:");
  console.log(JSON.stringify(tx, null, 2));
  console.log("");

  if (!hasAgentCreds()) {
    console.log("── Skipping live API (set ONECLAW_AGENT_ID + ONECLAW_AGENT_API_KEY in .env) ──");
    console.log("");
    return;
  }

  await trySign(tx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
