/**
 * Worker Agent — A2A server backed by 1Claw
 *
 * Implements the Google Agent-to-Agent (A2A) protocol as an Express server.
 * When the coordinator sends a task like "fetch production metrics", the
 * worker retrieves credentials from 1Claw and uses them to complete the task.
 *
 * Endpoints:
 *   GET  /.well-known/agent.json  → Agent Card (discovery)
 *   POST /                        → JSON-RPC task handling
 */

import express from "express";
import { createClient } from "@1claw/sdk";
import type {
    AgentCard,
    SendTaskRequest,
    SendTaskResponse,
    Task,
    Artifact,
} from "./a2a-types.js";

const PORT = parseInt(process.env.WORKER_PORT ?? "4100", 10);
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
// Only use agent token when ONECLAW_AGENT_ID is set; otherwise use user API key auth.
const AGENT_ID = process.env.ONECLAW_AGENT_ID?.trim() || undefined;

if (!API_KEY || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
    process.exit(1);
}

let sdk = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    agentId: AGENT_ID,
});

async function ensureVaultAccess(): Promise<void> {
    try {
        const list = await sdk.secrets.list(VAULT_ID!);
        if (list.error) throw new Error(list.error.message);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("401") && AGENT_ID) {
            console.error(
                "[worker] Agent token failed (401). Falling back to user API key (leave ONECLAW_AGENT_ID unset to use user key).",
            );
            sdk = createClient({ baseUrl: BASE_URL, apiKey: API_KEY });
            const authRes = await sdk.auth.apiKeyToken({ api_key: API_KEY! });
            if (authRes.error) throw new Error(authRes.error.message);
            const retry = await sdk.secrets.list(VAULT_ID!);
            if (retry.error) throw new Error(retry.error.message);
        } else {
            throw err;
        }
    }
}

const app = express();
app.use(express.json());

// ── Agent Card ──────────────────────────────────────────────────────

const agentCard: AgentCard = {
    name: "1Claw Vault Worker",
    description:
        "A worker agent that retrieves credentials from a 1Claw vault " +
        "and uses them to fetch data from external services.",
    url: `http://localhost:${PORT}`,
    version: "0.1.0",
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    skills: [
        {
            id: "fetch-secret",
            name: "Fetch Secret",
            description:
                "Retrieve a specific credential from the vault and report its metadata.",
            tags: ["secrets", "vault", "1claw"],
            examples: [
                "Fetch the production database credentials",
                "Get the Stripe API key",
            ],
        },
        {
            id: "list-secrets",
            name: "List Vault Secrets",
            description: "List all available secrets in the 1Claw vault.",
            tags: ["secrets", "vault", "1claw"],
        },
    ],
};

app.get("/.well-known/agent.json", (_req, res) => {
    res.json(agentCard);
});

// ── Task handler ────────────────────────────────────────────────────

const tasks = new Map<string, Task>();

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

    console.log(`[worker] Task ${id}: "${userText}"`);

    const task: Task = {
        id,
        sessionId: rpc.params.sessionId ?? id,
        status: { state: "working", timestamp: new Date().toISOString() },
        messages: [message],
    };
    tasks.set(id, task);

    try {
        const artifacts: Artifact[] = [];

        if (/list|available|what secrets/i.test(userText)) {
            const secretsRes = await sdk.secrets.list(VAULT_ID!);
            if (secretsRes.error) throw new Error(secretsRes.error.message);

            const secretList = secretsRes.data!.secrets.map(
                (s) => `- ${s.path} (${s.type}, v${s.version})`,
            );
            artifacts.push({
                name: "secret-list",
                description: "Vault secrets inventory",
                parts: [
                    {
                        type: "text",
                        text:
                            `Found ${secretList.length} secret(s):\n` +
                            secretList.join("\n"),
                    },
                ],
            });
        }

        if (/fetch|get|retrieve|credential|key/i.test(userText)) {
            const pathMatch = userText.match(
                /(?:secret|key|credential)s?\s+(?:at|for|named?|path)?\s*[""']?([a-zA-Z0-9/_-]+)[""']?/i,
            );

            if (pathMatch) {
                const path = pathMatch[1];
                const secretRes = await sdk.secrets.get(VAULT_ID!, path);
                if (secretRes.error) throw new Error(secretRes.error.message);
                artifacts.push({
                    name: "secret-metadata",
                    parts: [
                        {
                            type: "data",
                            data: {
                                path: secretRes.data!.path,
                                type: secretRes.data!.type,
                                version: secretRes.data!.version,
                                retrieved_at: new Date().toISOString(),
                                value_length: secretRes.data!.value.length,
                            },
                        },
                    ],
                });
            } else {
                const allSecrets = await sdk.secrets.list(VAULT_ID!);
                if (allSecrets.error) throw new Error(allSecrets.error.message);
                if (allSecrets.data!.secrets.length > 0) {
                    const first = allSecrets.data!.secrets[0];
                    const secretRes = await sdk.secrets.get(
                        VAULT_ID!,
                        first.path,
                    );
                    if (secretRes.error)
                        throw new Error(secretRes.error.message);
                    artifacts.push({
                        name: "secret-metadata",
                        parts: [
                            {
                                type: "data",
                                data: {
                                    path: secretRes.data!.path,
                                    type: secretRes.data!.type,
                                    version: secretRes.data!.version,
                                    retrieved_at: new Date().toISOString(),
                                    value_length: secretRes.data!.value.length,
                                },
                            },
                        ],
                    });
                }
            }
        }

        task.status = {
            state: "completed",
            message: {
                role: "agent",
                parts: [
                    {
                        type: "text",
                        text:
                            artifacts.length > 0
                                ? `Task completed with ${artifacts.length} artifact(s).`
                                : "Task completed. No matching secrets found for the request.",
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

ensureVaultAccess()
    .then(() => {
        app.listen(PORT, () => {
            console.log(
                `[worker] 1Claw Vault Worker agent listening on port ${PORT}`,
            );
            console.log(
                `[worker] Agent Card: http://localhost:${PORT}/.well-known/agent.json`,
            );
        });
    })
    .catch((err) => {
        console.error("[worker] Failed to reach vault:", err);
        process.exit(1);
    });
