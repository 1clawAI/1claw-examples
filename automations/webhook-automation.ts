/**
 * 1Claw SDK — Create a Webhook-Triggered Automation
 *
 * Creates an automation that fires when its webhook URL receives a
 * POST request. This is useful for integrating with external services
 * (GitHub, Stripe, monitoring alerts) that can send HTTP callbacks.
 *
 * Run: npx tsx --env-file=.env webhook-automation.ts
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
        // ── 1. Create a webhook-triggered automation ────────────────
        console.log("\n--- Creating webhook automation ---");

        const automation = await client.http.post<{
            id: string;
            name: string;
            trigger_type: string;
            trigger_config: Record<string, unknown>;
            action_type: string;
            is_active: boolean;
        }>("/v1/automations", {
            name: "github-deploy-hook",
            description: "Rotate secrets when a GitHub deployment webhook fires",
            agent_id: AGENT_ID,
            trigger_type: "webhook",
            trigger_config: {
                allowed_methods: ["POST"],
                secret_header: "X-Hub-Signature-256",
            },
            action_type: "agent_invoke",
            action_config: {
                prompt: "A new deployment was detected. Verify all secrets are current and rotate any that are expiring within 24 hours.",
                timeout_seconds: 60,
            },
            is_active: true,
        });

        automationId = automation.id;

        console.log(`Automation created: ${automation.name} (${automation.id})`);
        console.log(`  Trigger: ${automation.trigger_type}`);
        console.log(`  Active: ${automation.is_active}`);

        const webhookUrl = `${BASE_URL}/v1/automations/${automation.id}/trigger`;
        console.log(`  Webhook URL: ${webhookUrl}`);
        console.log("  (POST to this URL to trigger the automation)");

        // ── 2. List all automations ─────────────────────────────────
        console.log("\n--- Listing automations ---");

        const listResult = await client.http.get<{
            automations: Array<{
                id: string;
                name: string;
                trigger_type: string;
                is_active: boolean;
                run_count: number;
            }>;
        }>("/v1/automations");

        const automations = listResult.automations;
        console.log(`  Found ${automations.length} automation(s):`);
        for (const a of automations) {
            const status = a.is_active ? "active" : "paused";
            console.log(`    ${a.name} (${a.trigger_type}, ${status}, ${a.run_count} runs)`);
        }

        // ── 3. Update the automation ────────────────────────────────
        console.log("\n--- Updating automation ---");

        const updated = await client.http.patch<{
            id: string;
            name: string;
            description?: string;
        }>(`/v1/automations/${automationId}`, {
            description: "Updated: rotate secrets on GitHub deployment webhook",
            action_config: {
                prompt: "Deployment detected. Check and rotate expiring secrets.",
                timeout_seconds: 90,
            },
        });

        console.log(`  Updated: ${updated.name}`);
    } finally {
        // ── 4. Clean up ─────────────────────────────────────────────
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
