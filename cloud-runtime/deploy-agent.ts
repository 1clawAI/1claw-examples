/**
 * 1Claw SDK — Deploy Agent to Cloud Runtime
 *
 * Creates a cloud runtime for an agent using the "small" preset,
 * starts it, verifies it's running, then cleans up.
 *
 * Run: npx tsx --env-file=.env deploy-agent.ts
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

interface Runtime {
    id: string;
    name: string;
    agent_id: string;
    preset: string;
    provider: string;
    status: string;
    idle_timeout_secs: number;
    expose_http: boolean;
    public_url?: string;
    created_at: string;
}

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    const authRes = await client.auth.apiKeyToken({ api_key: API_KEY! });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }

    let runtimeId: string | null = null;

    try {
        // ── 1. Create a cloud runtime ───────────────────────────────
        console.log("\n--- Creating cloud runtime ---");

        const runtime = await client.http.post<Runtime>("/v1/runtimes", {
            name: "defi-bot-runtime",
            agent_id: AGENT_ID,
            preset: "small",
            env_public: {
                LOG_LEVEL: "info",
                CHAIN: "base",
            },
            idle_timeout_secs: 1800,
        });

        runtimeId = runtime.id;

        console.log(`Runtime created: ${runtime.name} (${runtime.id})`);
        console.log(`  Preset: ${runtime.preset}`);
        console.log(`  Provider: ${runtime.provider}`);
        console.log(`  Status: ${runtime.status}`);
        console.log(`  Idle timeout: ${runtime.idle_timeout_secs}s`);

        // ── 2. Start the runtime ────────────────────────────────────
        console.log("\n--- Starting runtime ---");

        const started = await client.http.post<Runtime>(
            `/v1/runtimes/${runtimeId}/start`,
        );

        console.log(`  Status: ${started.status}`);

        // ── 3. Poll status until running (or timeout) ───────────────
        console.log("\n--- Waiting for runtime to be ready ---");

        let status = started.status;
        for (let i = 0; i < 10 && status !== "running"; i++) {
            await new Promise((r) => setTimeout(r, 3000));

            const current = await client.http.get<Runtime>(
                `/v1/runtimes/${runtimeId}`,
            );

            status = current.status;
            console.log(`  Status: ${status} (attempt ${i + 1}/10)`);

            if (status === "failed") {
                console.error("  Runtime failed to start.");
                break;
            }
        }

        if (status === "running") {
            console.log("  Runtime is running.");
        }

        // ── 4. List all runtimes ────────────────────────────────────
        console.log("\n--- Listing runtimes ---");

        const listResult = await client.http.get<{ runtimes: Runtime[] }>(
            "/v1/runtimes",
        );

        const runtimes = listResult.runtimes;
        console.log(`  Found ${runtimes.length} runtime(s):`);
        for (const r of runtimes) {
            console.log(`    ${r.name} (${r.preset}, ${r.status})`);
        }
    } finally {
        // ── 5. Clean up: stop and delete ────────────────────────────
        if (runtimeId) {
            console.log("\n--- Cleaning up ---");

            try {
                await client.http.post(`/v1/runtimes/${runtimeId}/stop`);
                console.log("  Runtime stopped.");
            } catch (e) {
                console.error("  Failed to stop:", e instanceof Error ? e.message : e);
            }

            try {
                await client.http.delete(`/v1/runtimes/${runtimeId}`);
                console.log("  Runtime deleted.");
            } catch (e) {
                console.error("  Failed to delete:", e instanceof Error ? e.message : e);
            }
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
