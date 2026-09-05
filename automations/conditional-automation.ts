/**
 * 1Claw SDK — Conditional Automation
 *
 * Creates a cron automation that health-checks an API every 5 minutes and
 * uses skip_if + condition steps to alert only on failure. Demonstrates:
 * http step, skip_if/run_if, condition (if/else branching), template variables.
 *
 * Run: npx tsx --env-file=.env conditional-automation.ts
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

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    await client.auth.apiKeyToken({ api_key: API_KEY! });

    let automationId: string | null = null;

    try {
        console.log("\n--- Creating conditional automation ---");

        const created = await client.automations.create({
            name: "Health Check with Conditional Alert",
            agent_id: AGENT_ID!,
            trigger_type: "cron",
            cron_expr: "*/5 * * * *",
            workflow_spec: [
                {
                    name: "check",
                    type: "http",
                    params: {
                        url: "https://api.example.com/health",
                        method: "GET",
                    },
                },
                {
                    type: "notify",
                    skip_if: "{{steps.check.http_status}} == 200",
                    params: {
                        channel: "webhook",
                        url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
                        text: "Health check failed with status {{steps.check.http_status}}",
                    },
                },
                {
                    type: "condition",
                    expression: "{{steps.check.http_status}} != 200",
                    if_true: [
                        {
                            type: "ai_generate",
                            params: {
                                prompt: "The health check returned status {{steps.check.http_status}} with body: {{steps.check.output}}. Summarize the issue in one sentence.",
                                max_tokens: 256,
                            },
                        },
                    ],
                    if_false: [
                        {
                            type: "log",
                            params: { message: "All systems healthy" },
                        },
                    ],
                },
            ],
        });
        if (!created.data) throw new Error(created.error?.message ?? "create failed");
        const automation = created.data;
        automationId = automation.id;

        console.log(`Automation created: ${automation.name} (${automation.id})`);
        console.log(`  Trigger: ${automation.trigger_type}`);
        console.log(`  Cron: ${automation.cron_expr ?? "n/a"}`);
        console.log(`  Active: ${automation.is_active}`);

        // Trigger a manual run to test
        console.log("\n--- Triggering manual run ---");
        const run = await client.automations.trigger(automationId);
        console.log(
            `  Run: ${run.data?.id ?? "ok"} status=${run.data?.status ?? "triggered"}`,
        );
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
