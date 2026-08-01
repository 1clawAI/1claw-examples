/**
 * 1Claw SDK — Create a Cron-Scheduled Automation
 *
 * Creates an automation that invokes an agent on a recurring schedule
 * using a cron expression. The automation is created in an active state,
 * verified, then cleaned up.
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
    const authRes = await client.auth.apiKeyToken({ api_key: API_KEY! });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }

    let automationId: string | null = null;

    try {
        // ── 1. Create a cron-scheduled automation ───────────────────
        console.log("\n--- Creating scheduled automation ---");

        const createRes = await client.http.post<{
            id: string;
            name: string;
            trigger_type: string;
            trigger_config: Record<string, unknown>;
            action_type: string;
            is_active: boolean;
            next_run_at?: string;
        }>("/v1/automations", {
            name: "rotate-api-keys",
            description: "Rotate external API keys every 6 hours",
            agent_id: AGENT_ID,
            trigger_type: "schedule",
            trigger_config: {
                // Every 6 hours at minute 0
                cron: "0 */6 * * *",
                timezone: "UTC",
            },
            action_type: "agent_invoke",
            action_config: {
                prompt: "Rotate all API keys that are older than 7 days.",
                timeout_seconds: 120,
            },
            is_active: true,
        });

        if (createRes.error) {
            console.error("Failed to create automation:", createRes.error.message);
            return;
        }

        const automation = createRes.data!;
        automationId = automation.id;

        console.log(`Automation created: ${automation.name} (${automation.id})`);
        console.log(`  Trigger: ${automation.trigger_type}`);
        console.log(`  Cron: ${(automation.trigger_config as any)?.cron ?? "n/a"}`);
        console.log(`  Active: ${automation.is_active}`);
        if (automation.next_run_at) {
            console.log(`  Next run: ${automation.next_run_at}`);
        }

        // ── 2. Verify by fetching it back ───────────────────────────
        console.log("\n--- Verifying automation ---");

        const getRes = await client.http.get<{
            id: string;
            name: string;
            trigger_type: string;
            is_active: boolean;
            run_count: number;
        }>(`/v1/automations/${automationId}`);

        if (getRes.error) {
            console.error("Failed to get automation:", getRes.error.message);
        } else {
            const a = getRes.data!;
            console.log(`  Name: ${a.name}`);
            console.log(`  Active: ${a.is_active}`);
            console.log(`  Run count: ${a.run_count}`);
        }

        // ── 3. Pause the automation ─────────────────────────────────
        console.log("\n--- Pausing automation ---");

        const pauseRes = await client.http.patch<{ is_active: boolean }>(
            `/v1/automations/${automationId}`,
            { is_active: false },
        );

        if (pauseRes.error) {
            console.error("Failed to pause:", pauseRes.error.message);
        } else {
            console.log(`  Active: ${pauseRes.data!.is_active}`);
        }

        // ── 4. Trigger a manual run ─────────────────────────────────
        console.log("\n--- Triggering manual run ---");

        const triggerRes = await client.http.post(
            `/v1/automations/${automationId}/trigger`,
        );

        if (triggerRes.error) {
            console.error("Trigger failed:", triggerRes.error.message);
        } else {
            console.log("  Manual run triggered.");
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
