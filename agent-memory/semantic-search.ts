/**
 * 1Claw SDK — Semantic Memory (Namespace-Based Browsing)
 *
 * Demonstrates storing knowledge entries in a semantic namespace and
 * browsing them. Entries are encrypted at rest. Agents can organize
 * knowledge into namespaces for topic-based retrieval.
 *
 * Run: npx tsx --env-file=.env semantic-search.ts
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
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

interface MemoryEntry {
    id: string;
    agent_id: string;
    namespace: string;
    key: string;
    value: unknown;
    created_at: string;
    updated_at: string;
}

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    const authRes = await client.auth.apiKeyToken({ api_key: API_KEY! });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }

    const namespace = "knowledge";

    // Knowledge entries to store — each represents a fact or insight
    // the agent has learned over time
    const knowledgeEntries = [
        {
            key: "defi-aave-v3",
            value: {
                topic: "DeFi Protocol",
                content: "Aave V3 supports cross-chain lending with portals. Supply caps prevent concentration risk. E-mode enables high LTV for correlated assets.",
                tags: ["defi", "lending", "aave"],
            },
        },
        {
            key: "security-reentrancy",
            value: {
                topic: "Smart Contract Security",
                content: "Reentrancy attacks exploit external calls before state updates. Use checks-effects-interactions pattern or OpenZeppelin ReentrancyGuard.",
                tags: ["security", "solidity", "reentrancy"],
            },
        },
        {
            key: "gas-optimization",
            value: {
                topic: "EVM Gas Optimization",
                content: "Pack storage variables into 32-byte slots. Use calldata instead of memory for read-only function params. Prefer custom errors over require strings.",
                tags: ["gas", "optimization", "evm"],
            },
        },
        {
            key: "solana-programs",
            value: {
                topic: "Solana Development",
                content: "Solana programs are stateless. Account data is stored separately. PDAs (Program Derived Addresses) enable deterministic account creation without private keys.",
                tags: ["solana", "programs", "pda"],
            },
        },
    ];

    try {
        // ── 1. Store knowledge entries ──────────────────────────────
        console.log("\n--- Storing knowledge entries ---");

        for (const entry of knowledgeEntries) {
            const putRes = await client.http.put<MemoryEntry>(
                `/v1/agents/${AGENT_ID}/memory/${namespace}/${entry.key}`,
                { value: entry.value },
            );

            if (putRes.error) {
                console.error(`  Failed to store ${entry.key}:`, putRes.error.message);
            } else {
                console.log(`  Stored: ${entry.key} (${(entry.value as any).topic})`);
            }
        }

        // ── 2. List all entries in the knowledge namespace ──────────
        console.log("\n--- Browsing knowledge namespace ---");

        const listRes = await client.http.get<{ entries: MemoryEntry[] }>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}`,
        );

        if (listRes.error) {
            console.error("Failed:", listRes.error.message);
        } else {
            const entries = listRes.data!.entries;
            console.log(`  Found ${entries.length} knowledge entries:\n`);

            for (const entry of entries) {
                const val = entry.value as {
                    topic: string;
                    content: string;
                    tags: string[];
                };
                console.log(`  [${entry.key}]`);
                console.log(`    Topic: ${val.topic}`);
                console.log(`    Content: ${val.content.slice(0, 80)}...`);
                console.log(`    Tags: ${val.tags.join(", ")}`);
                console.log();
            }
        }

        // ── 3. Retrieve a specific entry by key ─────────────────────
        console.log("--- Retrieving specific entry ---");

        const getRes = await client.http.get<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/security-reentrancy`,
        );

        if (getRes.error) {
            console.error("Failed:", getRes.error.message);
        } else {
            const entry = getRes.data!;
            const val = entry.value as { topic: string; content: string };
            console.log(`  Key: ${entry.key}`);
            console.log(`  Topic: ${val.topic}`);
            console.log(`  Content: ${val.content}`);
        }

        // ── 4. Use multiple namespaces for organization ─────────────
        console.log("\n--- Storing in a second namespace ---");

        const putRes = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/session/last-query`,
            { value: { query: "What is reentrancy?", timestamp: new Date().toISOString() } },
        );

        if (!putRes.error) {
            console.log(`  Stored session/last-query`);
        }

        // List all namespaces
        console.log("\n--- All namespaces ---");

        const nsRes = await client.http.get<{ namespaces: string[] }>(
            `/v1/agents/${AGENT_ID}/memory`,
        );

        if (!nsRes.error) {
            console.log(`  Namespaces: ${nsRes.data!.namespaces.join(", ")}`);
        }
    } finally {
        // ── 5. Clean up ─────────────────────────────────────────────
        console.log("\n--- Cleaning up ---");

        for (const entry of knowledgeEntries) {
            await client.http.delete(
                `/v1/agents/${AGENT_ID}/memory/${namespace}/${entry.key}`,
            );
        }
        await client.http.delete(
            `/v1/agents/${AGENT_ID}/memory/session/last-query`,
        );
        console.log("  All entries deleted.");
    }

    console.log("\nDone!");
}

main().catch(console.error);
