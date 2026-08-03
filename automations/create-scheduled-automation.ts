/**
 * 1Claw SDK — Create a Cron-Scheduled Automation
 *
 * Creates an automation that invokes an agent on a recurring schedule
 * using a cron expression. Requires workflow_spec (+ agent_id, cron_expr).
 *
 * Run: npx tsx --env-file=.env create-scheduled-automation.ts
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

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    await client.auth.apiKeyToken({ api_key: API_KEY! });

    let automationId: string | null = null;

    try {
        // ── 1. Create a cron-scheduled automation ───────────────────
        console.log("\n--- Creating scheduled automation ---");

        const created = await client.automations.create({
            name: "rotate-api-keys",
            agent_id: AGENT_ID!,
            trigger_type: "cron",
            cron_expr: "0 */6 * * *",
            timezone: "UTC",
            workflow_spec: {
                steps: [
                    {
                        type: "log",
                        action: "run_agent_task",
                        message: "Rotate all API keys that are older than 7 days.",
                    },
                ],
            },
        });
        if (!created.data) throw new Error(created.error?.message ?? "create failed");
        const automation = created.data;
        automationId = automation.id;

        console.log(`Automation created: ${automation.name} (${automation.id})`);
        console.log(`  Trigger: ${automation.trigger_type}`);
        console.log(`  Cron: ${automation.cron_expr ?? "n/a"}`);
        console.log(`  Active: ${automation.is_active}`);
        if (automation.next_run_at) {
            console.log(`  Next run: ${automation.next_run_at}`);
        }

        // ── 2. Verify by fetching it back ───────────────────────────
        console.log("\n--- Verifying automation ---");

        const got = await client.automations.get(automationId);
        if (!got.data) throw new Error(got.error?.message ?? "get failed");
        const a = got.data;

        console.log(`  Name: ${a.name}`);
        console.log(`  Active: ${a.is_active}`);
        console.log(`  Workflow steps: ${JSON.stringify(a.workflow_spec)}`);

        // ── 3. Pause the automation ─────────────────────────────────
        console.log("\n--- Pausing automation ---");

        const paused = await client.automations.update(automationId, {
            is_active: false,
        });
        if (!paused.data) throw new Error(paused.error?.message ?? "update failed");

        console.log(`  Active: ${paused.data.is_active}`);

        // ── 4. Trigger a manual run ─────────────────────────────────
        console.log("\n--- Triggering manual run ---");

        const run = await client.automations.trigger(automationId);
        console.log(
            `  Manual run: ${run.data?.id ?? "ok"} status=${run.data?.status ?? "triggered"}`,
        );
    } finally {
        // ── 5. Clean up ─────────────────────────────────────────────
        if (automationId) {
            console.log("\n--- Cleaning up ---");
            try {
                await client.automations.delete(automationId);
                console.log("Automation deleted.");
            } catch (e) {
                console.error("Failed to delete:", e);
            }
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
