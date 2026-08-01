/**
 * 1Claw SDK — Browse the Agent Directory
 *
 * Demonstrates browsing the public agent directory. This endpoint
 * requires no authentication — anyone can discover agents.
 *
 * Run: npx tsx --env-file=.env browse-directory.ts
 */

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

interface DirectoryEntry {
    id: string;
    name: string;
    description: string;
    tags: string[];
    a2a_url?: string;
    mcp_url?: string;
    capabilities: string[];
}

interface DirectoryResponse {
    agents: DirectoryEntry[];
    total: number;
    page: number;
    page_size: number;
}

async function fetchDirectory(params?: {
    q?: string;
    tags?: string;
    page?: number;
    page_size?: number;
}): Promise<DirectoryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.tags) searchParams.set("tags", params.tags);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));

    const qs = searchParams.toString();
    const url = `${BASE_URL}/v1/agents/directory${qs ? `?${qs}` : ""}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Directory request failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
}

function printAgent(agent: DirectoryEntry, index: number) {
    console.log(`\n  ${index + 1}. ${agent.name}`);
    console.log(`     ID: ${agent.id}`);

    const desc = agent.description.length > 100
        ? agent.description.slice(0, 100) + "..."
        : agent.description;
    console.log(`     Description: ${desc}`);

    if (agent.tags.length > 0) {
        console.log(`     Tags: ${agent.tags.join(", ")}`);
    }
    if (agent.a2a_url) {
        console.log(`     A2A: ${agent.a2a_url}`);
    }
    if (agent.mcp_url) {
        console.log(`     MCP: ${agent.mcp_url}`);
    }
    if (agent.capabilities.length > 0) {
        console.log(`     Capabilities: ${agent.capabilities.join(", ")}`);
    }
}

async function main() {
    // ── 1. Browse all agents (first page) ───────────────────────
    console.log("--- Agent Directory (all agents) ---");

    const allAgents = await fetchDirectory({ page_size: 10 });

    console.log(`  Total agents: ${allAgents.total}`);
    console.log(`  Page: ${allAgents.page} (${allAgents.page_size} per page)`);

    if (allAgents.agents.length === 0) {
        console.log("  No discoverable agents found.");
        console.log("  Run make-discoverable.ts first to add one.");
    } else {
        for (let i = 0; i < allAgents.agents.length; i++) {
            printAgent(allAgents.agents[i], i);
        }
    }

    // ── 2. Search by keyword ────────────────────────────────────
    console.log("\n\n--- Search: 'defi' ---");

    const defiAgents = await fetchDirectory({ q: "defi", page_size: 5 });

    console.log(`  Found ${defiAgents.total} agent(s) matching 'defi'`);
    for (let i = 0; i < defiAgents.agents.length; i++) {
        printAgent(defiAgents.agents[i], i);
    }

    // ── 3. Filter by tags ───────────────────────────────────────
    console.log("\n\n--- Filter by tag: 'security' ---");

    const securityAgents = await fetchDirectory({ tags: "security", page_size: 5 });

    console.log(`  Found ${securityAgents.total} agent(s) with tag 'security'`);
    for (let i = 0; i < securityAgents.agents.length; i++) {
        printAgent(securityAgents.agents[i], i);
    }

    // ── 4. Pagination ───────────────────────────────────────────
    if (allAgents.total > 5) {
        console.log("\n\n--- Page 2 ---");

        const page2 = await fetchDirectory({ page: 2, page_size: 5 });
        console.log(`  Page ${page2.page}: ${page2.agents.length} agent(s)`);
        for (let i = 0; i < page2.agents.length; i++) {
            printAgent(page2.agents[i], i);
        }
    }

    // ── 5. Fetch a specific agent card ──────────────────────────
    if (allAgents.agents.length > 0) {
        const firstAgent = allAgents.agents[0];
        console.log(`\n\n--- Agent card: ${firstAgent.name} ---`);

        const cardUrl = `${BASE_URL}/v1/agents/${firstAgent.id}/card`;
        const cardRes = await fetch(cardUrl);

        if (cardRes.ok) {
            const card: DirectoryEntry = await cardRes.json();
            console.log(`  Name: ${card.name}`);
            console.log(`  Description: ${card.description}`);
            console.log(`  Tags: ${card.tags.join(", ")}`);
            if (card.capabilities.length > 0) {
                console.log(`  Capabilities: ${card.capabilities.join(", ")}`);
            }
        } else {
            console.log(`  Failed to fetch card: ${cardRes.status}`);
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
