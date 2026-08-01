/**
 * 1Claw SDK — List Automation Run History
 *
 * Creates an automation, triggers it manually, then lists
 * the resulting run history with status and timing info.
 *
 * Run: npx tsx --env-file=.env list-runs.ts
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

interface AutomationRun {
    id: string;
    automation_id: string;
    status: "pending" | "running" | "success" | "failed" | "cancelled";
    trigger: string;
    started_at: string;
    completed_at?: string;
    duration_ms?: number;
    error?: string;
    output?: Record<string, unknown>;
}

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    const authRes = await client.auth.apiKeyToken({ api_key: API_KEY! });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }

    let automationId: string | null = null;

    try {
        // ── 1. Create a manual automation for testing ───────────────
        console.log("\n--- Creating manual automation ---");

        const createRes = await client.http.post<{
            id: string;
            name: string;
        }>("/v1/automations", {
            name: "run-history-demo",
            description: "Temporary automation to demonstrate run history listing",
            agent_id: AGENT_ID,
            trigger_type: "manual",
            action_type: "agent_invoke",
            action_config: {
                prompt: "List all vaults and report their secret counts.",
                timeout_seconds: 30,
            },
            is_active: true,
        });

        if (createRes.error) {
            console.error("Failed to create automation:", createRes.error.message);
            return;
        }

        automationId = createRes.data!.id;
        console.log(`Automation: ${createRes.data!.name} (${automationId})`);

        // ── 2. Trigger a couple of manual runs ──────────────────────
        console.log("\n--- Triggering runs ---");

        for (let i = 1; i <= 2; i++) {
            const triggerRes = await client.http.post(
                `/v1/automations/${automationId}/trigger`,
            );
            if (triggerRes.error) {
                console.error(`Run ${i} trigger failed:`, triggerRes.error.message);
            } else {
                console.log(`  Run ${i} triggered.`);
            }
            // Brief pause between triggers
            await new Promise((r) => setTimeout(r, 1000));
        }

        // Wait a moment for runs to complete
        console.log("  Waiting for runs to complete...");
        await new Promise((r) => setTimeout(r, 3000));

        // ── 3. List all runs for this automation ────────────────────
        console.log("\n--- Run history ---");

        const runsRes = await client.http.get<{ runs: AutomationRun[] }>(
            `/v1/automations/${automationId}/runs`,
        );

        if (runsRes.error) {
            console.error("Failed to list runs:", runsRes.error.message);
        } else {
            const runs = runsRes.data!.runs;
            console.log(`  Total runs: ${runs.length}`);

            for (const run of runs) {
                const started = new Date(run.started_at).toLocaleString();
                const duration = run.duration_ms != null ? `${run.duration_ms}ms` : "in progress";
                console.log(`\n  Run ${run.id.slice(0, 8)}...`);
                console.log(`    Status:   ${run.status}`);
                console.log(`    Trigger:  ${run.trigger}`);
                console.log(`    Started:  ${started}`);
                console.log(`    Duration: ${duration}`);
                if (run.error) {
                    console.log(`    Error:    ${run.error}`);
                }
            }

            // Summary
            const succeeded = runs.filter((r) => r.status === "success").length;
            const failed = runs.filter((r) => r.status === "failed").length;
            const pending = runs.filter((r) =>
                r.status === "pending" || r.status === "running",
            ).length;
            console.log(`\n  Summary: ${succeeded} succeeded, ${failed} failed, ${pending} pending`);
        }

        // ── 4. Fetch a single run (if any exist) ────────────────────
        const runs = runsRes.data?.runs ?? [];
        if (runs.length > 0) {
            const runId = runs[0].id;
            console.log(`\n--- Fetching run detail: ${runId.slice(0, 8)}... ---`);

            const runRes = await client.http.get<AutomationRun>(
                `/v1/automations/${automationId}/runs/${runId}`,
            );

            if (runRes.error) {
                console.error("Failed to get run:", runRes.error.message);
            } else {
                const run = runRes.data!;
                console.log(`  Status: ${run.status}`);
                if (run.output) {
                    console.log(`  Output: ${JSON.stringify(run.output, null, 2)}`);
                }
            }
        }
    } finally {
        // ── 5. Clean up ─────────────────────────────────────────────
        if (automationId) {
            console.log("\n--- Cleaning up ---");
            const delRes = await client.http.delete(`/v1/automations/${automationId}`);
            if (!delRes.error) {
                console.log("Automation deleted.");
            } else {
                console.error("Failed to delete:", delRes.error.message);
            }
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
