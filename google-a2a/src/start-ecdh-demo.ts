/**
 * Start both ECDH demo agents (Alice, Bob) and the coordinator.
 * Alice on 4100, Bob on 4101.
 *
 * For 1Claw-backed keys (recommended), set in env (or .env):
 *   ONECLAW_ALICE_AGENT_ID, ONECLAW_ALICE_API_KEY
 *   ONECLAW_BOB_AGENT_ID,   ONECLAW_BOB_API_KEY
 * These are mapped to each worker's ONECLAW_AGENT_ID / ONECLAW_API_KEY.
 * No VAULT_ID needed — keys come from the platform __agent-keys vault.
 */

import { spawn } from "child_process";

const aliceEnv = {
    ...process.env,
    AGENT_NAME: "Alice",
    PORT: "4100",
    ...(process.env.ONECLAW_ALICE_AGENT_ID && process.env.ONECLAW_ALICE_API_KEY
        ? {
              ONECLAW_AGENT_ID: process.env.ONECLAW_ALICE_AGENT_ID,
              ONECLAW_API_KEY: process.env.ONECLAW_ALICE_API_KEY,
          }
        : {}),
};

const bobEnv = {
    ...process.env,
    AGENT_NAME: "Bob",
    PORT: "4101",
    ...(process.env.ONECLAW_BOB_AGENT_ID && process.env.ONECLAW_BOB_API_KEY
        ? {
              ONECLAW_AGENT_ID: process.env.ONECLAW_BOB_AGENT_ID,
              ONECLAW_API_KEY: process.env.ONECLAW_BOB_API_KEY,
          }
        : {}),
};

console.log("Starting Alice (port 4100)...");
const alice = spawn("npx", ["tsx", "src/ecdh-worker.ts"], {
    stdio: "inherit",
    env: aliceEnv,
});

await new Promise((r) => setTimeout(r, 800));

console.log("Starting Bob (port 4101)...");
const bob = spawn("npx", ["tsx", "src/ecdh-worker.ts"], {
    stdio: "inherit",
    env: bobEnv,
});

await new Promise((r) => setTimeout(r, 1500));

console.log("\nStarting ECDH coordinator...\n");
const coordinator = spawn("npx", ["tsx", "src/ecdh-coordinator.ts"], {
    stdio: "inherit",
    env: {
        ...process.env,
        ALICE_URL: "http://localhost:4100",
        BOB_URL: "http://localhost:4101",
    },
});

coordinator.on("exit", (code) => {
    alice.kill();
    bob.kill();
    process.exit(code ?? 0);
});

process.on("SIGINT", () => {
    alice.kill();
    bob.kill();
    coordinator.kill();
});
