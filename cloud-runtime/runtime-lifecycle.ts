/**
 * 1Claw SDK — Runtime Lifecycle
 *
 * Demonstrates the full lifecycle of a cloud runtime:
 *   create → start → poll status → stop → delete
 *
 * Run: npx tsx --env-file=.env runtime-lifecycle.ts
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

interface Runtime {
    id: string;
    name: string;
    agent_id: string;
    preset: string;
    provider: string;
    status: string;
    idle_timeout_secs: number;
    expose_http: boolean;
    slug?: string;
    public_url?: string;
    last_activity_at?: string;
    trial_hours_used?: number;
    monthly_hours_used?: number;
    created_at: string;
    updated_at: string;
}

function printRuntime(r: Runtime, label?: string) {
    if (label) console.log(`\n  ${label}`);
    console.log(`  Name:           ${r.name}`);
    console.log(`  ID:             ${r.id}`);
    console.log(`  Status:         ${r.status}`);
    console.log(`  Preset:         ${r.preset}`);
    console.log(`  Provider:       ${r.provider}`);
    console.log(`  Idle timeout:   ${r.idle_timeout_secs}s`);
    if (r.last_activity_at) {
        console.log(`  Last activity:  ${r.last_activity_at}`);
    }
    if (r.monthly_hours_used != null) {
        console.log(`  Hours used:     ${r.monthly_hours_used}`);
    }
}

async function waitForStatus(
    client: ReturnType<typeof createClient>,
    runtimeId: string,
    target: string,
    maxAttempts = 15,
): Promise<Runtime | null> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));

        try {
            const runtime = await client.http.get<Runtime>(
                `/v1/runtimes/${runtimeId}`,
            );

            console.log(`  Status: ${runtime.status} (${i + 1}/${maxAttempts})`);

            if (runtime.status === target) return runtime;
            if (runtime.status === "failed") {
                console.error("  Runtime entered failed state.");
                return runtime;
            }
        } catch (e) {
            console.error(`  Poll failed: ${e instanceof Error ? e.message : e}`);
            return null;
        }
    }

    console.error(`  Timed out waiting for '${target}'.`);
    return null;
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
        // ── 1. CREATE ───────────────────────────────────────────────
        console.log("\n=== STEP 1: CREATE ===");

        const runtime = await client.http.post<Runtime>("/v1/runtimes", {
            name: "lifecycle-demo",
            agent_id: AGENT_ID,
            preset: "micro",
            idle_timeout_secs: 600,
            env_public: {
                DEMO: "true",
            },
        });

        runtimeId = runtime.id;
        printRuntime(runtime);

        // ── 2. START ────────────────────────────────────────────────
        console.log("\n=== STEP 2: START ===");

        const started = await client.http.post<Runtime>(
            `/v1/runtimes/${runtimeId}/start`,
        );

        console.log(`  Status after start: ${started.status}`);

        // ── 3. WAIT FOR RUNNING ─────────────────────────────────────
        console.log("\n=== STEP 3: POLL STATUS ===");

        const runningRuntime = await waitForStatus(client, runtimeId, "running");

        if (runningRuntime && runningRuntime.status === "running") {
            printRuntime(runningRuntime, "Runtime is up:");
        }

        // ── 4. UPDATE CONFIG ────────────────────────────────────────
        console.log("\n=== STEP 4: UPDATE ===");

        const updated = await client.http.patch<Runtime>(
            `/v1/runtimes/${runtimeId}`,
            {
                idle_timeout_secs: 300,
                env_public: { DEMO: "true", UPDATED: "true" },
            },
        );

        console.log(`  Idle timeout: ${updated.idle_timeout_secs}s`);

        // ── 5. STOP ─────────────────────────────────────────────────
        console.log("\n=== STEP 5: STOP ===");

        const stopped = await client.http.post<Runtime>(
            `/v1/runtimes/${runtimeId}/stop`,
        );

        console.log(`  Status after stop: ${stopped.status}`);

        // Wait for stopped status
        const stoppedRuntime = await waitForStatus(client, runtimeId, "stopped");
        if (stoppedRuntime) {
            console.log(`  Final status: ${stoppedRuntime.status}`);
        }

        // ── 6. DELETE ───────────────────────────────────────────────
        console.log("\n=== STEP 6: DELETE ===");

        await client.http.delete(`/v1/runtimes/${runtimeId}`);
        console.log("  Runtime deleted.");
        runtimeId = null;
    } finally {
        // Safety net: delete the runtime if it wasn't cleaned up
        if (runtimeId) {
            console.log("\n--- Emergency cleanup ---");
            await client.http.post(`/v1/runtimes/${runtimeId}/stop`).catch(() => {});
            await client.http.delete(`/v1/runtimes/${runtimeId}`).catch(() => {});
            console.log("  Runtime cleaned up.");
        }
    }

    console.log("\nLifecycle complete!");
}

main().catch(console.error);
