/**
 * 1Claw SDK — Create a Webhook-Triggered Automation
 *
 * Creates an automation that fires when its public webhook URL receives a
 * POST. Create returns a one-time `whk_` token + `webhook_url`
 * (`/v1/automations/webhook/{id}/{token}`). Use rotateWebhookToken() to mint a new one.
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

        const created = await client.automations.create({
            name: "github-deploy-hook",
            agent_id: AGENT_ID!,
            trigger_type: "webhook",
            timezone: "UTC",
            workflow_spec: {
                steps: [
                    {
                        type: "log",
                        message:
                            "A new deployment was detected. Verify secrets and rotate any expiring within 24 hours.",
                    },
                    {
                        type: "http",
                        method: "GET",
                        url: "https://httpbin.org/status/200",
                    },
                ],
            },
        });
        if (!created.data) throw new Error(created.error?.message ?? "create failed");
        const automation = created.data;
        automationId = automation.id;

        console.log(`Automation created: ${automation.name} (${automation.id})`);
        console.log(`  Trigger: ${automation.trigger_type}`);
        console.log(`  Active: ${automation.is_active}`);

        if (automation.webhook_url) {
            console.log(`  Webhook URL: ${automation.webhook_url}`);
        }
        if (automation.webhook_token) {
            console.log(
                `  Webhook token (one-time): ${automation.webhook_token.slice(0, 12)}…`,
            );
        }
        console.log("  (POST JSON to webhook URL — no Bearer auth required)");

        // ── 2. List all automations ─────────────────────────────────
        console.log("\n--- Listing automations ---");

        const listResult = await client.automations.list();
        const items = listResult.data?.automations ?? [];
        for (const a of items) {
            console.log(
                `  - ${a.name} (${a.id.slice(0, 8)}…) trigger=${a.trigger_type} active=${a.is_active}`,
            );
        }
    } finally {
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
