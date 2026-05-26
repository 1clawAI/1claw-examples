/**
 * Intents Coordinator — sends transaction tasks to the Intents Worker via A2A
 *
 * Discovers the worker, queries signer info, then sends a sequence of
 * transaction tasks (simulate → sign → submit) to demonstrate the full
 * Intents API flow through A2A.
 */

import { randomUUID } from "crypto";
import type {
    AgentCard,
    SendTaskRequest,
    SendTaskResponse,
} from "./a2a-types.js";

const WORKER_URL = process.env.INTENTS_WORKER_URL ?? "http://localhost:4300";

async function sendTask(text: string, sessionId?: string): Promise<SendTaskResponse["result"]> {
    const rpc: SendTaskRequest = {
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tasks/send",
        params: {
            id: randomUUID(),
            sessionId,
            message: {
                role: "user",
                parts: [{ type: "text", text }],
            },
        },
    };

    const resp = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc),
    });

    const result: SendTaskResponse = await resp.json();
    return result.result;
}

async function main() {
    console.log("[intents-coordinator] Starting Intents A2A coordinator...\n");

    // ── Step 1: Discover worker ─────────────────────────────────────
    console.log(`[intents-coordinator] Discovering worker at ${WORKER_URL}...`);
    const cardRes = await fetch(`${WORKER_URL}/.well-known/agent.json`);
    if (!cardRes.ok) {
        console.error(`[intents-coordinator] Failed to fetch Agent Card: ${cardRes.status}`);
        process.exit(1);
    }
    const card: AgentCard = await cardRes.json();
    console.log(`[intents-coordinator] Found: "${card.name}"`);
    console.log(`[intents-coordinator] ${card.description}`);
    console.log(`[intents-coordinator] Skills: ${card.skills.map((s) => s.name).join(", ")}\n`);

    const sessionId = randomUUID();

    // ── Step 2: Get signer info ─────────────────────────────────────
    console.log("[intents-coordinator] Task: Show signer info and guardrails");
    const info = await sendTask("Show signer info and guardrails", sessionId);
    console.log(`[intents-coordinator] State: ${info.status.state}`);
    if (info.artifacts?.length) {
        for (const a of info.artifacts) {
            for (const p of a.parts) {
                if (p.type === "data") {
                    console.log("[intents-coordinator] Signer config:", JSON.stringify(p.data, null, 2));
                }
            }
        }
    }

    // ── Step 3: Sign a transaction (no broadcast) ───────────────────
    const testAddr = "0x000000000000000000000000000000000000dEaD";
    console.log(`\n[intents-coordinator] Task: Sign a transfer of 0.001 ETH to ${testAddr}`);
    const signResult = await sendTask(
        `Sign a transfer of 0.001 ETH to ${testAddr}`,
        sessionId,
    );
    console.log(`[intents-coordinator] State: ${signResult.status.state}`);
    if (signResult.status.state === "completed" && signResult.artifacts?.length) {
        for (const a of signResult.artifacts) {
            for (const p of a.parts) {
                if (p.type === "data") {
                    console.log("[intents-coordinator] Signed tx:", JSON.stringify(p.data, null, 2));
                }
            }
        }
    } else if (signResult.status.state === "failed") {
        const failMsg = signResult.status.message?.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join(" ");
        console.log(`[intents-coordinator] Expected failure (guardrails): ${failMsg}`);
    }

    // ── Step 4: List transaction history ────────────────────────────
    console.log("\n[intents-coordinator] Task: List recent transactions");
    const history = await sendTask("List recent transactions", sessionId);
    console.log(`[intents-coordinator] State: ${history.status.state}`);
    if (history.artifacts?.length) {
        for (const a of history.artifacts) {
            for (const p of a.parts) {
                if (p.type === "data") {
                    const data = p.data as { count: number };
                    console.log(`[intents-coordinator] Transaction count: ${data.count}`);
                }
            }
        }
    }

    console.log("\n[intents-coordinator] Demo complete.");
    console.log("[intents-coordinator] The agent signed a transaction via the Intents API");
    console.log("[intents-coordinator] without ever holding the private key.\n");
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
