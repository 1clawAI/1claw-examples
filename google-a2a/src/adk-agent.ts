/**
 * Google ADK Agent — backed by 1Claw vault
 *
 * Defines an LlmAgent with FunctionTool-wrapped 1Claw SDK operations.
 * The LLM (Gemini) decides which tools to call based on user instructions.
 *
 * Requires: ONECLAW_API_KEY, ONECLAW_VAULT_ID, GOOGLE_API_KEY (or GEMINI_API_KEY)
 */

import {
    LlmAgent,
    FunctionTool,
    InMemoryRunner,
    stringifyContent,
} from "@google/adk";
import { createUserContent, type Content } from "@google/genai";
import { z } from "zod";
import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!API_KEY || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
    process.exit(1);
}

const sdk = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    agentId: AGENT_ID || undefined,
});

// ── 1Claw FunctionTools ──────────────────────────────────────────────

const listSecretsTool = new FunctionTool({
    name: "list_secrets",
    description:
        "List all secrets stored in the 1Claw vault. Returns paths, types, and version numbers — never raw values.",
    parameters: z.object({}),
    execute: async () => {
        const res = await sdk.secrets.list(VAULT_ID!);
        if (res.error) return { status: "error", error: res.error.message };
        return {
            status: "success",
            total: res.data!.secrets.length,
            secrets: res.data!.secrets.map((s) => ({
                path: s.path,
                type: s.type,
                version: s.version,
            })),
        };
    },
});

const getSecretTool = new FunctionTool({
    name: "get_secret",
    description:
        "Fetch the decrypted value of a secret by its path. Returns the value, type, and version.",
    parameters: z.object({
        path: z
            .string()
            .describe(
                'The secret path (e.g. "db/password", "keys/api-key")',
            ),
    }),
    execute: async ({ path }) => {
        const res = await sdk.secrets.get(VAULT_ID!, path);
        if (res.error) return { status: "error", error: res.error.message };
        return {
            status: "success",
            path: res.data!.path,
            type: res.data!.type,
            value: res.data!.value,
            version: res.data!.version,
        };
    },
});

const putSecretTool = new FunctionTool({
    name: "put_secret",
    description: "Store or update a secret in the 1Claw vault.",
    parameters: z.object({
        path: z.string().describe("Secret path"),
        value: z.string().describe("Secret value to store"),
        type: z
            .string()
            .default("api_key")
            .describe(
                "Secret type: api_key, password, private_key, env_bundle, note",
            ),
    }),
    execute: async ({ path, value, type }) => {
        const res = await sdk.secrets.set(VAULT_ID!, path, value, { type });
        if (res.error) return { status: "error", error: res.error.message };
        return {
            status: "stored",
            path: res.data!.path,
            version: res.data!.version,
        };
    },
});

// ── ADK Agent ────────────────────────────────────────────────────────

export const vaultAgent = new LlmAgent({
    name: "oneclaw_vault_agent",
    model: "gemini-2.5-flash",
    description:
        "An AI agent that manages secrets in a 1Claw vault — list, read, and store secrets.",
    instruction: `You are a helpful DevOps assistant that manages secrets in a 1Claw vault.

You can list all secrets, fetch specific secret values, and store new secrets.
When listing secrets, present them clearly with their paths, types, and versions.
When fetching a secret, show its metadata (path, type, version) and value.
When asked to store a secret, confirm the path and type after storing.
Never fabricate secret values — always use the tools to interact with the vault.
If a tool returns an error, explain it clearly to the user.`,
    tools: [listSecretsTool, getSecretTool, putSecretTool],
});

// ── Runner helper (for A2A integration) ──────────────────────────────

export async function runAgent(prompt: string): Promise<string> {
    const runner = new InMemoryRunner({ agent: vaultAgent });
    const session = await runner.sessionService.createSession({
        appName: runner.appName,
        userId: "a2a-coordinator",
    });

    const userContent: Content = createUserContent(prompt);
    const events: Array<{ content?: { parts?: Array<{ text?: string }> } }> =
        [];

    for await (const event of runner.runAsync({
        userId: session.userId,
        sessionId: session.id,
        newMessage: userContent,
    })) {
        events.push(event);
    }

    const finalEvent = events[events.length - 1];
    if (finalEvent?.content?.parts?.length) {
        return finalEvent.content.parts
            .map((p) => p.text ?? "")
            .filter(Boolean)
            .join("");
    }
    return "No response from agent.";
}
