/**
 * Start the Intents A2A demo: Intents worker + coordinator.
 *
 * Launches the Intents worker (port 4300) which handles transaction
 * signing via 1Claw's Intents API, then runs the coordinator which
 * sends tasks: signer info → sign tx → list history.
 */

import { spawn } from "child_process";

const WORKER_PORT = process.env.WORKER_PORT ?? "4300";

console.log("Starting Intents worker agent...");

const worker = spawn("npx", ["tsx", "--env-file=.env.intents", "src/intents-worker.ts"], {
    stdio: "inherit",
    env: { ...process.env, WORKER_PORT },
    cwd: process.cwd(),
});

let workerExited = false;
worker.on("exit", (code) => {
    workerExited = true;
    if (code !== 0) {
        console.error(`\nIntents worker exited with code ${code} — aborting.`);
        process.exit(code ?? 1);
    }
});

await new Promise((r) => setTimeout(r, 2500));

if (workerExited) process.exit(1);

console.log("\nStarting Intents coordinator...\n");

const coordinator = spawn("npx", ["tsx", "src/intents-coordinator.ts"], {
    stdio: "inherit",
    env: { ...process.env, INTENTS_WORKER_URL: `http://localhost:${WORKER_PORT}` },
    cwd: process.cwd(),
});

coordinator.on("exit", (code) => {
    console.log(`\nCoordinator exited with code ${code}`);
    worker.kill();
    process.exit(code ?? 0);
});

process.on("SIGINT", () => {
    worker.kill();
    coordinator.kill();
});
