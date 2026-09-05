/**
 * 1Claw SDK — List Automation Run History
 *
 * Creates an automation, triggers it manually, then lists
 * the resulting run history with status and timing info.
 *
 * Run: npx tsx --env-file=.env list-runs.ts
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
    await client.auth.apiKeyToken({ api_key: API_KEY! });

    let automationId: string | null = null;

    try {
        // ── 1. Create a manual automation for testing ───────────────
        console.log("\n--- Creating manual automation ---");

        const automation = await client.http.post<{
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

        automationId = automation.id;
        console.log(`Automation: ${automation.name} (${automationId})`);

        // ── 2. Trigger a couple of manual runs ──────────────────────
        console.log("\n--- Triggering runs ---");

        for (let i = 1; i <= 2; i++) {
            await client.http.post<{ run_id: string; status: string }>(
                `/v1/automations/${automationId}/trigger`,
                {},
            );
            console.log(`  Run ${i} triggered.`);
            await new Promise<void>((r) => setTimeout(r, 1000));
        }

        // Wait a moment for runs to complete
        console.log("  Waiting for runs to complete...");
        await new Promise<void>((r) => setTimeout(r, 3000));

        // ── 3. List all runs for this automation ────────────────────
        console.log("\n--- Run history ---");

        const runsResult = await client.http.get<{ runs: AutomationRun[] }>(
            `/v1/automations/${automationId}/runs`,
        );

        const runs = runsResult.runs;
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
        const succeeded = runs.filter((r: AutomationRun) => r.status === "success").length;
        const failed = runs.filter((r: AutomationRun) => r.status === "failed").length;
        const pending = runs.filter((r: AutomationRun) =>
            r.status === "pending" || r.status === "running",
        ).length;
        console.log(`\n  Summary: ${succeeded} succeeded, ${failed} failed, ${pending} pending`);

        // ── 4. Fetch a single run (if any exist) ────────────────────
        if (runs.length > 0) {
            const runId = runs[0].id;
            console.log(`\n--- Fetching run detail: ${runId.slice(0, 8)}... ---`);

            const run = await client.http.get<AutomationRun>(
                `/v1/automations/${automationId}/runs/${runId}`,
            );

            console.log(`  Status: ${run.status}`);
            if (run.output) {
                console.log(`  Output: ${JSON.stringify(run.output, null, 2)}`);
            }
        }
    } finally {
        // ── 5. Clean up ─────────────────────────────────────────────
        if (automationId) {
            console.log("\n--- Cleaning up ---");
            try {
                await client.http.delete(`/v1/automations/${automationId}`);
                console.log("Automation deleted.");
            } catch (e) {
                console.error("Failed to delete:", e);
            }
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
