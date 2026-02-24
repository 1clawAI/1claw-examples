/**
 * 1Claw + LangChain — Custom Tool Calling
 *
 * Simple demo: an LLM agent uses 1Claw to list vault secrets and retrieve
 * the first secret (reports path and type only, never the value).
 * Supports OpenAI (OPENAI_API_KEY) or Gemini free tier (GOOGLE_API_KEY).
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIToolsAgent, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;

if (!API_KEY || !VAULT_ID) {
    console.error("Required env vars: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
    process.exit(1);
}
if (!OPENAI_API_KEY && !GOOGLE_API_KEY) {
    console.error(
        "Set one LLM: OPENAI_API_KEY (OpenAI) or GOOGLE_API_KEY (Gemini free tier from https://aistudio.google.com/apikey)",
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
        "Use this when the user asks for the contents of a secret (e.g. a text note or message).",
    schema: z.object({
        path: z.string().describe("Secret path, e.g. 'demo/secret-message'"),
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

// ── Create the agent ────────────────────────────────────────────────

const useGemini = Boolean(GOOGLE_API_KEY);
const llm = useGemini
    ? new ChatGoogleGenerativeAI({
          model: "gemini-2.0-flash",
          temperature: 0,
          apiKey: GOOGLE_API_KEY,
      })
    : new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

const prompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        "You are a helpful assistant with access to a 1Claw vault. " +
            "Use list_vault_secrets to see what's stored, and get_secret to fetch a secret by path. " +
            "When reporting a fetched secret to the user, only report its path and type — never the secret value.",
    ],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
]);

const tools = [listSecretsTool, getSecretTool];
let agent;
if (useGemini) {
    agent = createToolCallingAgent({ llm, tools, prompt });
} else {
    agent = await createOpenAIToolsAgent({ llm, tools, prompt });
}
const executor = new AgentExecutor({ agent, tools, verbose: true });

// ── Run ─────────────────────────────────────────────────────────────

console.log("=== 1Claw + LangChain Agent ===\n");
console.log(`LLM: ${useGemini ? "Gemini (GOOGLE_API_KEY)" : "OpenAI (OPENAI_API_KEY)"}\n`);
console.log(
    "Asking: list vault secrets, then fetch the first secret and report its path and type (not the value).\n",
);

const result = await executor.invoke({
    input:
        "List the secrets in my vault. Then fetch the first secret from that list using get_secret and report back its path and type only — do not display the secret value.",
});

console.log("\n--- Agent Response ---");
console.log(result.output);
