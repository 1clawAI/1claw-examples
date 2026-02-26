/**
 * Start the ADK A2A demo: ADK-powered worker + coordinator.
 *
 * The ADK worker exposes a Gemini-powered vault agent via A2A protocol.
 * The existing coordinator discovers it, sends tasks, and prints results —
 * same flow as the plain worker demo, but the ADK worker uses an LLM
 * to reason about which 1Claw tools to call.
 */

import { spawn } from "child_process";

const ADK_PORT = process.env.ADK_WORKER_PORT ?? "4200";

console.log(`Starting ADK vault agent (port ${ADK_PORT})...`);

const worker = spawn("npx", ["tsx", "src/adk-a2a-server.ts"], {
    stdio: "inherit",
    env: { ...process.env },
});

await new Promise((r) => setTimeout(r, 3000));

console.log("\nStarting coordinator → ADK worker...\n");

const coordinator = spawn("npx", ["tsx", "src/coordinator.ts"], {
    stdio: "inherit",
    env: { ...process.env, WORKER_URL: `http://localhost:${ADK_PORT}` },
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
