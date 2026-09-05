/**
 * 1Claw SDK — TTL Scratch Memory
 *
 * Demonstrates scratch entries with a TTL (time-to-live). These entries
 * auto-expire after the specified number of seconds, making them ideal
 * for caching, session state, rate-limit counters, or temporary data.
 *
 * Run: npx tsx --env-file=.env ttl-scratch.ts
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

    const namespace = "scratch";

    try {
        // ── 1. Store an entry with a 60-second TTL ──────────────────
        console.log("\n--- Storing scratch entry (60s TTL) ---");

        const putCache = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/eth-price`,
            {
                value: {
                    price_usd: 3450.27,
                    source: "coingecko",
                    fetched_at: new Date().toISOString(),
                },
                ttl_seconds: 60,
            },
        );

        console.log(`  Stored: ${putCache.key}`);
        console.log(`  Value: ${JSON.stringify(putCache.value)}`);
        console.log(`  Expires at: ${putCache.ttl_expires_at ?? "never"}`);

        // ── 2. Store a rate-limit counter with 300s TTL ─────────────
        console.log("\n--- Storing rate-limit counter (300s TTL) ---");

        const putCounter = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/api-calls-count`,
            {
                value: { count: 1, window_start: new Date().toISOString() },
                ttl_seconds: 300,
            },
        );

        console.log(`  Stored: ${putCounter.key}`);
        console.log(`  Expires at: ${putCounter.ttl_expires_at ?? "never"}`);

        // ── 3. Store session state with 1800s (30 min) TTL ──────────
        console.log("\n--- Storing session state (30 min TTL) ---");

        const putSession = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/current-task`,
            {
                value: {
                    task: "portfolio-rebalance",
                    step: 3,
                    total_steps: 7,
                    started_at: new Date().toISOString(),
                },
                ttl_seconds: 1800,
            },
        );

        console.log(`  Stored: ${putSession.key}`);
        console.log(`  Expires at: ${putSession.ttl_expires_at ?? "never"}`);

        // ── 4. Read back and check TTL ──────────────────────────────
        console.log("\n--- Reading entries back ---");

        const entry = await client.http.get<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/eth-price`,
        );

        const expiresAt = entry.ttl_expires_at
            ? new Date(entry.ttl_expires_at)
            : null;
        const remainingSecs = expiresAt
            ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000))
            : null;

        console.log(`  Key: ${entry.key}`);
        console.log(`  Value: ${JSON.stringify(entry.value)}`);
        console.log(`  Expires at: ${entry.ttl_expires_at ?? "never"}`);
        if (remainingSecs != null) {
            console.log(`  Remaining: ${remainingSecs}s`);
        }

        // ── 5. Update an entry (refreshes TTL) ──────────────────────
        console.log("\n--- Updating counter (new TTL) ---");

        const updated = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/api-calls-count`,
            {
                value: { count: 2, window_start: new Date().toISOString() },
                ttl_seconds: 300,
            },
        );

        console.log(`  Updated: ${updated.key}`);
        console.log(`  New expiry: ${updated.ttl_expires_at ?? "never"}`);

        // ── 6. List all scratch entries ─────────────────────────────
        console.log("\n--- Listing scratch entries ---");

        const listRes = await client.http.get<{ entries: MemoryEntry[] }>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}`,
        );

        const entries = listRes.entries;
        console.log(`  Entries in '${namespace}': ${entries.length}`);
        for (const e of entries) {
            const expires = e.ttl_expires_at ?? "permanent";
            console.log(`    ${e.key} (expires: ${expires})`);
        }

        // ── 7. Store a durable entry (no TTL) for comparison ────────
        console.log("\n--- Storing entry without TTL (permanent) ---");

        const putPerm = await client.http.put<MemoryEntry>(
            `/v1/agents/${AGENT_ID}/memory/${namespace}/permanent-note`,
            { value: "This entry has no TTL and will not auto-expire." },
        );

        console.log(`  Stored: ${putPerm.key}`);
        console.log(`  Expires at: ${putPerm.ttl_expires_at ?? "never (permanent)"}`);
    } finally {
        // ── 8. Clean up ─────────────────────────────────────────────
        console.log("\n--- Cleaning up ---");

        for (const key of ["eth-price", "api-calls-count", "current-task", "permanent-note"]) {
            await client.http.delete(
                `/v1/agents/${AGENT_ID}/memory/${namespace}/${key}`,
            );
        }
        console.log("  All scratch entries deleted.");
    }

    console.log("\nDone!");
}

main().catch(console.error);
