/**
 * 1Claw + LangChain — Custom Tool Calling
 *
 * Demonstrates how to wrap the 1Claw SDK as LangChain tools so an
 * OpenAI-powered agent can fetch secrets just-in-time. The agent is
 * asked to "check the Stripe balance" and autonomously:
 *   1. Lists available secrets in the vault
 *   2. Fetches the Stripe API key
 *   3. Calls the Stripe API with the key
 */

import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY || !VAULT_ID || !OPENAI_API_KEY) {
    console.error(
        "Required env vars: ONECLAW_API_KEY, ONECLAW_VAULT_ID, OPENAI_API_KEY",
    );
    process.exit(1);
}

const client = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    agentId: process.env.ONECLAW_AGENT_ID || undefined,
});

await new Promise((r) => setTimeout(r, 1000));

// ── Define 1Claw tools for LangChain ───────────────────────────────

const listSecretsTool = new DynamicStructuredTool({
    name: "list_vault_secrets",
    description:
        "List all secrets stored in the 1Claw vault. Returns metadata " +
        "(path, type, version) — never the actual values.",
    schema: z.object({}),
    func: async () => {
        const res = await client.secrets.list(VAULT_ID!);
        if (res.error) return `Error: ${res.error.message}`;
        const secrets = res.data!.secrets.map(
            (s) => `${s.path} (${s.type}, v${s.version})`,
        );
        return secrets.length
            ? `Found ${secrets.length} secret(s):\n${secrets.join("\n")}`
            : "No secrets found in the vault.";
    },
});

const getSecretTool = new DynamicStructuredTool({
    name: "get_secret",
    description:
        "Fetch the decrypted value of a secret from the 1Claw vault by path. " +
        "Use this only when you need the actual credential to call an API.",
    schema: z.object({
        path: z.string().describe("Secret path, e.g. 'api-keys/stripe'"),
    }),
    func: async ({ path }) => {
        const res = await client.secrets.get(VAULT_ID!, path);
        if (res.error) return `Error: ${res.error.message}`;
        return JSON.stringify({
            path: res.data!.path,
            type: res.data!.type,
            value: res.data!.value,
            version: res.data!.version,
        });
    },
});

const callStripeTool = new DynamicStructuredTool({
    name: "call_stripe_api",
    description:
        "Call the Stripe API with a given API key. Currently supports " +
        "retrieving the account balance.",
    schema: z.object({
        api_key: z
            .string()
            .describe("Stripe API key (sk_live_... or sk_test_...)"),
        endpoint: z
            .string()
            .default("/v1/balance")
            .describe("Stripe API endpoint path"),
    }),
    func: async ({ api_key, endpoint }) => {
        try {
            const res = await fetch(`https://api.stripe.com${endpoint}`, {
                headers: { Authorization: `Bearer ${api_key}` },
            });
            if (!res.ok)
                return `Stripe API error: ${res.status} ${res.statusText}`;
            return JSON.stringify(await res.json(), null, 2);
        } catch (err) {
            return `Network error: ${err instanceof Error ? err.message : err}`;
        }
    },
});

// ── Create the agent ────────────────────────────────────────────────

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

const prompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        "You are a helpful assistant with access to a secure 1Claw vault. " +
            "When you need an API key or credential, use the vault tools to " +
            "fetch it. Never display raw secret values to the user — just " +
            "confirm you retrieved them and show the result of using them.",
    ],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
]);

const tools = [listSecretsTool, getSecretTool, callStripeTool];
const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent, tools, verbose: true });

// ── Run ─────────────────────────────────────────────────────────────

console.log("=== 1Claw + LangChain Agent ===\n");
console.log(
    "Asking: 'What secrets are in my vault and what is my Stripe balance?'\n",
);

const result = await executor.invoke({
    input:
        "What secrets are available in my vault? If there's a Stripe API " +
        "key, use it to check my account balance.",
});

console.log("\n--- Agent Response ---");
console.log(result.output);
