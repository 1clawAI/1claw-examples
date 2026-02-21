/**
 * 1Claw + LangChain — MCP Client
 *
 * Connects LangChain to the hosted 1Claw MCP server so the agent
 * automatically gets all 11 vault tools (list_secrets, get_secret,
 * put_secret, etc.) without defining them manually.
 *
 * This uses @langchain/mcp-adapters to bridge MCP tools into LangChain.
 */

import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createOpenAIToolsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const AGENT_TOKEN = process.env.ONECLAW_AGENT_TOKEN;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!AGENT_TOKEN || !VAULT_ID || !OPENAI_API_KEY) {
    console.error(
        "Required env vars: ONECLAW_AGENT_TOKEN, ONECLAW_VAULT_ID, OPENAI_API_KEY",
    );
    process.exit(1);
}

// ── Connect to the 1Claw MCP server ────────────────────────────────

const mcpClient = new MultiServerMCPClient({
    "1claw": {
        transport: "sse",
        url: "https://mcp.1claw.xyz/mcp",
        headers: {
            Authorization: `Bearer ${AGENT_TOKEN}`,
            "X-Vault-ID": VAULT_ID,
        },
    },
});

const tools = await mcpClient.getTools();
console.log(
    `Loaded ${tools.length} tools from 1Claw MCP:`,
    tools.map((t) => t.name).join(", "),
);

// ── Create the agent ────────────────────────────────────────────────

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

const prompt = ChatPromptTemplate.fromMessages([
    [
        "system",
        "You are a helpful assistant connected to a 1Claw vault via MCP. " +
            "You have tools to list, read, write, and share secrets. " +
            "Never display raw secret values — confirm actions and summarize results.",
    ],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
]);

const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent, tools, verbose: true });

// ── Run ─────────────────────────────────────────────────────────────

console.log("\n=== 1Claw MCP + LangChain Agent ===\n");

const result = await executor.invoke({
    input: "List the secrets in my vault, then describe the first one.",
});

console.log("\n--- Agent Response ---");
console.log(result.output);

await mcpClient.close();
