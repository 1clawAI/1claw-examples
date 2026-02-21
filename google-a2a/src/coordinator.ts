/**
 * Coordinator Agent — A2A client
 *
 * Discovers the worker agent via its Agent Card, sends it a task,
 * and processes the response. Optionally uses OpenAI to reason about
 * the results.
 */

import { randomUUID } from "crypto";
import type {
    AgentCard,
    SendTaskRequest,
    SendTaskResponse,
} from "./a2a-types.js";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:4100";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function main() {
    console.log("[coordinator] Starting A2A coordinator...\n");

    // ── Step 1: Discover the worker via its Agent Card ──────────────

    console.log(`[coordinator] Discovering worker at ${WORKER_URL}...`);
    const cardRes = await fetch(`${WORKER_URL}/.well-known/agent.json`);
    if (!cardRes.ok) {
        console.error(
            `[coordinator] Failed to fetch Agent Card: ${cardRes.status}`,
        );
        process.exit(1);
    }
    const card: AgentCard = await cardRes.json();
    console.log(`[coordinator] Found: "${card.name}" — ${card.description}`);
    console.log(
        `[coordinator] Skills: ${card.skills.map((s) => s.name).join(", ")}\n`,
    );

    // ── Step 2: Send a task to the worker ───────────────────────────

    const taskId = randomUUID();
    const taskRequest = "List all available secrets in the vault";
    console.log(`[coordinator] Sending task: "${taskRequest}"`);

    const rpcRequest: SendTaskRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/send",
        params: {
            id: taskId,
            message: {
                role: "user",
                parts: [{ type: "text", text: taskRequest }],
            },
        },
    };

    const taskRes = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcRequest),
    });

    const rpcResponse: SendTaskResponse = await taskRes.json();
    const task = rpcResponse.result;

    console.log(`[coordinator] Task ${task.id} — state: ${task.status.state}`);

    if (task.status.message) {
        const agentText = task.status.message.parts
            .filter(
                (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .join("\n");
        console.log(`[coordinator] Agent says: ${agentText}`);
    }

    if (task.artifacts?.length) {
        console.log(
            `\n[coordinator] Received ${task.artifacts.length} artifact(s):`,
        );
        for (const artifact of task.artifacts) {
            console.log(`  - ${artifact.name}:`);
            for (const part of artifact.parts) {
                if (part.type === "text") console.log(`    ${part.text}`);
                if (part.type === "data")
                    console.log(`    ${JSON.stringify(part.data, null, 2)}`);
            }
        }
    }

    // ── Step 3: (Optional) Reason about the result with an LLM ─────

    if (OPENAI_API_KEY) {
        console.log("\n[coordinator] Asking LLM to summarize the results...");

        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI();

        const artifactContent = task.artifacts
            ?.flatMap((a) =>
                a.parts.map((p) =>
                    p.type === "text" ? p.text : JSON.stringify(p.data),
                ),
            )
            .join("\n");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You are reviewing the output of an agent-to-agent task. " +
                        "Summarize the findings in 2-3 sentences.",
                },
                {
                    role: "user",
                    content: `Task: ${taskRequest}\n\nResult:\n${artifactContent}`,
                },
            ],
        });

        console.log(
            `[coordinator] LLM summary: ${completion.choices[0].message.content}`,
        );
    }

    // ── Step 4: Send a follow-up task ───────────────────────────────

    console.log(
        "\n[coordinator] Sending follow-up: fetch a specific credential...",
    );

    const followUp: SendTaskRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tasks/send",
        params: {
            id: randomUUID(),
            sessionId: task.sessionId,
            message: {
                role: "user",
                parts: [
                    {
                        type: "text",
                        text: "Retrieve the credential for the first secret in the vault",
                    },
                ],
            },
        },
    };

    const followRes = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(followUp),
    });

    const followRpc: SendTaskResponse = await followRes.json();
    console.log(
        `[coordinator] Follow-up state: ${followRpc.result.status.state}`,
    );
    if (followRpc.result.artifacts?.length) {
        for (const a of followRpc.result.artifacts) {
            for (const p of a.parts) {
                if (p.type === "data") {
                    console.log(`[coordinator] Secret metadata:`, p.data);
                }
            }
        }
    }

    console.log("\n[coordinator] Done.");
}

main().catch(console.error);
