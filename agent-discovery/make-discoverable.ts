/**
 * 1Claw SDK — Make an Agent Discoverable
 *
 * Enables discovery on an existing agent and configures its public
 * agent card with a description, tags, and protocol URLs. The agent
 * will then appear in the public agent directory.
 *
 * Run: npx tsx --env-file=.env make-discoverable.ts
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!API_KEY) {
    console.error("Set ONECLAW_API_KEY in your environment or .env file");
    process.exit(1);
}
if (!AGENT_ID) {
    console.error("Set ONECLAW_AGENT_ID in your environment or .env file");
    process.exit(1);
}

interface AgentCard {
    id: string;
    name: string;
    description: string;
    tags: string[];
    a2a_url?: string;
    mcp_url?: string;
    capabilities: string[];
}

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    const authRes = await client.auth.apiKeyToken({ api_key: API_KEY! });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }

    try {
        // ── 1. Check current agent state ────────────────────────────
        console.log("\n--- Current agent state ---");

        const agentRes = await client.agents.get(AGENT_ID!);
        if (agentRes.error) {
            console.error("Failed to get agent:", agentRes.error.message);
            return;
        }

        const agent = agentRes.data!;
        console.log(`  Name: ${agent.name}`);
        console.log(`  Discoverable: ${(agent as any).discoverable ?? false}`);

        // ── 2. Enable discovery and set public profile ──────────────
        console.log("\n--- Enabling discovery ---");

        await client.http.patch(
            `/v1/agents/${AGENT_ID}/discovery`,
            {
                discoverable: true,
                public_description:
                    "An autonomous DeFi agent that monitors lending markets, " +
                    "rebalances positions, and executes optimal yield strategies " +
                    "across Ethereum, Base, and Solana.",
                public_tags: ["defi", "lending", "yield", "ethereum", "solana"],
            },
        );

        console.log("  Discovery enabled.");

        // ── 3. Fetch the public agent card ──────────────────────────
        console.log("\n--- Agent card ---");

        const card = await client.http.get<AgentCard>(
            `/v1/agents/${AGENT_ID}/card`,
        );

        console.log(`  Name: ${card.name}`);
        console.log(`  Description: ${card.description}`);
        console.log(`  Tags: ${card.tags.join(", ")}`);
        if (card.a2a_url) console.log(`  A2A URL: ${card.a2a_url}`);
        if (card.mcp_url) console.log(`  MCP URL: ${card.mcp_url}`);
        if (card.capabilities.length > 0) {
            console.log(`  Capabilities: ${card.capabilities.join(", ")}`);
        }

        // ── 4. Verify in the directory ──────────────────────────────
        console.log("\n--- Searching directory ---");

        const dirResult = await client.http.get<{
            agents: AgentCard[];
            total: number;
        }>(`/v1/agents/directory?q=${encodeURIComponent(agent.name)}`);

        const found = dirResult.agents.find((a: AgentCard) => a.id === AGENT_ID);
        if (found) {
            console.log(`  Found in directory: ${found.name}`);
            console.log(`  Tags: ${found.tags.join(", ")}`);
        } else {
            console.log("  Not yet visible in directory (may take a moment to index).");
        }

        // ── 5. Update tags ──────────────────────────────────────────
        console.log("\n--- Updating tags ---");

        await client.http.patch(
            `/v1/agents/${AGENT_ID}/discovery`,
            {
                public_tags: ["defi", "lending", "yield", "ethereum", "solana", "base", "aave"],
            },
        );

        console.log("  Tags updated.");

        // ── 6. Disable discovery (restore original state) ───────────
        console.log("\n--- Disabling discovery ---");

        await client.http.patch(
            `/v1/agents/${AGENT_ID}/discovery`,
            { discoverable: false },
        );

        console.log("  Discovery disabled. Agent removed from directory.");
    } catch (err) {
        console.error("Unexpected error:", err);
    }

    console.log("\nDone!");
}

main().catch(console.error);
