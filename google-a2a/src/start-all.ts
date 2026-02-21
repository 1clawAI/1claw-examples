/**
 * Start both worker and coordinator for local testing.
 * The worker starts first, then the coordinator runs after a brief delay.
 */

import { spawn } from "child_process";

console.log("Starting worker agent...");

const worker = spawn("npx", ["tsx", "src/worker-agent.ts"], {
    stdio: "inherit",
    env: { ...process.env },
});

await new Promise((r) => setTimeout(r, 2000));

console.log("\nStarting coordinator...\n");

const coordinator = spawn("npx", ["tsx", "src/coordinator.ts"], {
    stdio: "inherit",
    env: { ...process.env },
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
