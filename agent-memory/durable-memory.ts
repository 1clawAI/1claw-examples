/**
 * 1Claw SDK — Durable Memory
 *
 * Demonstrates storing and retrieving durable key-value memory entries
 * for an agent. Entries are encrypted at rest and persist across
 * agent restarts and sessions.
 *
 * Run: npx tsx --env-file=.env durable-memory.ts
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

interface MemoryEntry {
    id: string;
    agent_id: string;
    namespace: string;
    key: string;
    value: unknown;
    ttl_expires_at?: string | null;
    created_at: string;
    updated_at: string;
}

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    await client.auth.apiKeyToken({ api_key: API_KEY! });

    const namespace = "preferences";

    try {
        // ── 1. Store a simple string value ──────────────────────────
        console.log("\n--- Storing string entry ---");

        const putStr = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/language`,
            { value: "TypeScript" },
        );

        console.log(`  Stored: ${putStr.namespace}/${putStr.key} = ${JSON.stringify(putStr.value)}`);

        // ── 2. Store a structured JSON object ───────────────────────
        console.log("\n--- Storing JSON object ---");

        const putObj = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/config`,
            {
                value: {
                    theme: "dark",
                    model: "gpt-4o",
                    max_tokens: 4096,
                    chains: ["ethereum", "base", "solana"],
                },
            },
        );

        console.log(`  Stored: ${putObj.namespace}/${putObj.key}`);
        console.log(`  Value: ${JSON.stringify(putObj.value, null, 2)}`);

        // ── 3. Retrieve an entry ────────────────────────────────────
        console.log("\n--- Retrieving entry ---");

        const entry = await client.http.get<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/config`,
        );

        console.log(`  Key: ${entry.key}`);
        console.log(`  Value: ${JSON.stringify(entry.value)}`);
        console.log(`  Updated: ${entry.updated_at}`);

        // ── 4. Overwrite an entry (upsert) ──────────────────────────
        console.log("\n--- Updating entry (upsert) ---");

        const updated = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/language`,
            { value: "Rust" },
        );

        console.log(`  Updated: ${updated.key} = ${JSON.stringify(updated.value)}`);

        // ── 5. List all entries in the namespace ────────────────────
        console.log("\n--- Listing entries ---");

        const listRes = await client.http.get<{ entries: MemoryEntry[] }>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}`,
        );

        const entries = listRes.entries;
        console.log(`  Entries in '${namespace}': ${entries.length}`);
        for (const e of entries) {
            const val = typeof e.value === "string" ? e.value : JSON.stringify(e.value);
            const preview = val.length > 40 ? val.slice(0, 40) + "..." : val;
            console.log(`    ${e.key} = ${preview}`);
        }

        // ── 6. List all namespaces ──────────────────────────────────
        console.log("\n--- Listing namespaces ---");

        const nsRes = await client.http.get<{ namespaces: string[] }>(
            `/v1/agents/${AGENT_ID}/memory`,
        );

        console.log(`  Namespaces: ${nsRes.namespaces.join(", ")}`);
    } finally {
        // ── 7. Clean up ─────────────────────────────────────────────
        console.log("\n--- Cleaning up ---");

        for (const key of ["language", "config"]) {
            try {
                await client.http.delete(
                    `/v1/agents/${AGENT_ID}/memory/${namespace}/${key}`,
                );
                console.log(`  Deleted: ${namespace}/${key}`);
            } catch {
                // ignore cleanup errors
            }
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
