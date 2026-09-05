/**
 * Intents layers — solver-shaped plan → 1Claw signing intent (agent → HSM/TEE).
 *
 * See README.md for SOLVER_MODE (mock | 1inch) and BROADCAST (optional mainnet / testnet spend).
 */
import { readFile } from "node:fs/promises";
import { createClient, type SignTransactionRequest } from "@1claw/sdk";
import { mockSolverFillPlan } from "./mock-solver.js";
import { fetch1inchSwapPlan, ONEINCH_ETH_PLACEHOLDER } from "./quote-1inch.js";

const BASE_URL = (process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co").replace(/\/$/, "");
const AGENT_ID = (process.env.ONECLAW_AGENT_ID ?? "").trim();
const AGENT_KEY = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
const DEMO_TO = (process.env.DEMO_TO_ADDRESS ?? "0x0000000000000000000000000000000000000000").trim();

const SOLVER_MODE = (process.env.SOLVER_MODE ?? "mock").toLowerCase().trim();
const BROADCAST = (process.env.BROADCAST ?? "").trim() === "1";

function hasAgentCreds(): boolean {
  return Boolean(
    AGENT_ID &&
      AGENT_KEY &&
      AGENT_ID !== "your-agent-uuid" &&
      !AGENT_KEY.startsWith("ocv_your_"),
  );
}

/** Non-empty key from `ONEINCH_API_KEY` or first line of `ONEINCH_API_KEY_FILE`. */
async function resolveOneinchApiKey(): Promise<string> {
  const direct = (process.env.ONEINCH_API_KEY ?? "").trim();
  if (direct) return direct;
  const filePath = (process.env.ONEINCH_API_KEY_FILE ?? "").trim();
  if (!filePath) return "";
  try {
    return (await readFile(filePath, "utf8")).split(/\r?\n/)[0]?.trim() ?? "";
  } catch {
    throw new Error(`ONEINCH_API_KEY_FILE is set but file could not be read: ${filePath}`);
  }
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
  const modeLine =
    SOLVER_MODE === "1inch"
      ? "  This run: SOLVER_MODE=1inch (live 1inch Swap API → 1Claw)."
      : "  This run: SOLVER_MODE=mock (toy plan). Set SOLVER_MODE=1inch for a live aggregator quote.";
  console.log(modeLine);
  if (BROADCAST) {
    console.log("  ⚠ BROADCAST=1 — will call submitTransaction (on-chain spend + gas).");
  } else {
    console.log("  Sign-only: set BROADCAST=1 to submit after signing (see README warnings).");
  }
  console.log("");
}

async function loadPlan(): Promise<{ narrative: string; tx: SignTransactionRequest }> {
  if (SOLVER_MODE === "mock") {
    const chain = "sepolia";
    return mockSolverFillPlan({ chain, to: DEMO_TO });
  }

  if (SOLVER_MODE === "1inch") {
    const apiKey = await resolveOneinchApiKey();
    if (!apiKey) {
      console.error("");
      console.error("  SOLVER_MODE=1inch needs a non-empty 1inch token.");
      console.error("  • Put it in .env: ONEINCH_API_KEY=<token from https://portal.1inch.dev/>");
      console.error("  • Or: export ONEINCH_API_KEY='…' before npm start");
      console.error("  • Or: ONEINCH_API_KEY_FILE=/path/to/file (single line, no quotes)");
      console.error("  Note: ONEINCH_API_KEY= with nothing after = still counts as empty.");
      console.error("");
      throw new Error("ONEINCH_API_KEY is missing or empty");
    }
    const chainId = parseInt(process.env.CHAIN_ID ?? "1", 10);
    if (Number.isNaN(chainId)) throw new Error("Invalid CHAIN_ID");

    const from = (process.env.QUOTE_FROM_ADDRESS ?? "").trim().toLowerCase();
    if (!from.startsWith("0x") || from.length !== 42) {
      throw new Error(
        "QUOTE_FROM_ADDRESS must be the EOA that matches keys/{chain}-signer (0x + 40 hex)",
      );
    }

    const src = (process.env.SWAP_SRC_TOKEN ?? ONEINCH_ETH_PLACEHOLDER).trim();
    const dst = (process.env.SWAP_DST_TOKEN ?? "").trim();
    if (!dst.startsWith("0x")) {
      throw new Error("SWAP_DST_TOKEN is required (ERC-20 contract address, 0x…)");
    }
    const amount = (process.env.SWAP_AMOUNT ?? "").trim();
    if (!amount || BigInt(amount) <= 0n) {
      throw new Error("SWAP_AMOUNT is required (sell amount in smallest token units, e.g. wei for ETH)");
    }
    const slippage = parseFloat(process.env.SWAP_SLIPPAGE_PERCENT ?? "2");
    if (Number.isNaN(slippage)) throw new Error("Invalid SWAP_SLIPPAGE_PERCENT");

    return fetch1inchSwapPlan({
      apiKey,
      chainId,
      from,
      src,
      dst,
      amount,
      slippagePercent: slippage,
    });
  }

  throw new Error(`Unknown SOLVER_MODE="${SOLVER_MODE}" (use mock or 1inch)`);
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

async function tryBroadcast(plan: SignTransactionRequest): Promise<void> {
  const client = createClient({
    baseUrl: BASE_URL,
    apiKey: AGENT_KEY,
    agentId: AGENT_ID,
  });

  const simulateFirst = (process.env.SIMULATE_FIRST ?? "true").toLowerCase() !== "false";
  console.log("── Calling 1Claw Intents API (submitTransaction / broadcast) ──");
  console.log("  simulate_first:", simulateFirst);
  const res = await client.agents.submitTransaction(AGENT_ID, {
    ...plan,
    simulate_first: simulateFirst,
  });

  if (res.error) {
    console.log("  API error:", res.error.message ?? res.error);
    process.exitCode = 1;
    return;
  }

  if (res.data) {
    console.log("  ✓ status:", res.data.status);
    console.log("  ✓ tx_hash:", res.data.tx_hash ?? "(none)");
    if (res.data.signed_tx) {
      console.log("  ✓ signed_tx (first 42 chars):", res.data.signed_tx.slice(0, 42) + "…");
    }
  }
}

async function main(): Promise<void> {
  printBanner();

  let narrative: string;
  let tx: SignTransactionRequest;
  try {
    const plan = await loadPlan();
    narrative = plan.narrative;
    tx = plan.tx;
  } catch (e) {
    console.error((e as Error).message ?? e);
    process.exitCode = 1;
    return;
  }

  console.log("── Layer A (execution plan) ──");
  console.log(narrative);
  console.log("");
  console.log("Execution plan (JSON) → POST …/transactions/sign or …/transactions:");
  console.log(JSON.stringify(tx, null, 2));
  console.log("");

  if (!hasAgentCreds()) {
    console.log("── Skipping live API (set ONECLAW_AGENT_ID + ONECLAW_AGENT_API_KEY in .env) ──");
    console.log("");
    return;
  }

  if (BROADCAST) {
    await tryBroadcast(tx);
  } else {
    await trySign(tx);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
