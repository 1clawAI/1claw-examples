/**
 * ADK A2A Server — Google ADK agent exposed via A2A protocol
 *
 * Wraps the ADK vault agent in an Express server that implements
 * the Google Agent-to-Agent (A2A) protocol. The existing coordinator
 * can discover and interact with this agent just like the plain worker.
 *
 * The key difference: this worker uses Gemini (via ADK) to reason about
 * tasks, choosing which 1Claw tools to call based on natural language.
 */

import express from "express";
import { runAgent } from "./adk-agent.js";
import type {
    AgentCard,
    SendTaskRequest,
    SendTaskResponse,
    Task,
    Artifact,
} from "./a2a-types.js";

const PORT = parseInt(process.env.ADK_WORKER_PORT ?? "4200", 10);

const app = express();
app.use(express.json());

// ── Agent Card ───────────────────────────────────────────────────────

const agentCard: AgentCard = {
    name: "1Claw ADK Vault Agent",
    description:
        "A Google ADK-powered agent that manages 1Claw vault secrets " +
        "using Gemini for natural-language reasoning and tool selection.",
    url: `http://localhost:${PORT}`,
    version: "0.1.0",
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    skills: [
        {
            id: "list-secrets",
            name: "List Vault Secrets",
            description:
                "List all secrets in the 1Claw vault with paths, types, and versions.",
            tags: ["secrets", "vault", "1claw", "adk"],
        },
        {
            id: "fetch-secret",
            name: "Fetch Secret",
            description:
                "Retrieve a specific secret value from the vault by path.",
            tags: ["secrets", "vault", "1claw", "adk"],
        },
        {
            id: "store-secret",
            name: "Store Secret",
            description:
                "Store a new secret or update an existing one in the vault.",
            tags: ["secrets", "vault", "1claw", "adk"],
        },
    ],
};

app.get("/.well-known/agent.json", (_req, res) => {
    res.json(agentCard);
});

// ── A2A Task handler ─────────────────────────────────────────────────

app.post("/", async (req, res) => {
    const rpc = req.body as SendTaskRequest;

    if (rpc.method !== "tasks/send") {
        res.status(400).json({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32601, message: `Unknown method: ${rpc.method}` },
        });
        return;
    }

    const { id, message } = rpc.params;
    const userText = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");

    console.log(`[adk-worker] Task ${id}: "${userText}"`);

    const task: Task = {
        id,
        sessionId: rpc.params.sessionId ?? id,
        status: { state: "working", timestamp: new Date().toISOString() },
        messages: [message],
    };

    try {
        const agentResponse = await runAgent(userText);

        const artifacts: Artifact[] = [
            {
                name: "adk-response",
                description:
                    "Response from the ADK vault agent (Gemini-powered)",
                parts: [{ type: "text", text: agentResponse }],
            },
        ];

        task.status = {
            state: "completed",
            message: {
                role: "agent",
                parts: [
                    {
                        type: "text",
                        text: `Task completed with ${artifacts.length} artifact(s).`,
                    },
                ],
            },
            timestamp: new Date().toISOString(),
        };
        task.artifacts = artifacts;
    } catch (err) {
        task.status = {
            state: "failed",
            message: {
                role: "agent",
                parts: [
                    {
                        type: "text",
                        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
                    },
                ],
            },
            timestamp: new Date().toISOString(),
        };
    }

    const response: SendTaskResponse = {
        jsonrpc: "2.0",
        id: rpc.id,
        result: task,
    };
    res.json(response);
});

// ── Start ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(
        `[adk-worker] 1Claw ADK Vault Agent listening on port ${PORT}`,
    );
    console.log(
        `[adk-worker] Agent Card: http://localhost:${PORT}/.well-known/agent.json`,
    );
    console.log(
        `[adk-worker] Powered by Google ADK + Gemini 2.5 Flash`,
    );
});
