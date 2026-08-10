/**
 * 1Claw SDK — Webhook Automation with Variable Passing
 *
 * Creates a webhook automation that receives lead submissions, uses AI to
 * classify them, stores results in agent memory, and conditionally notifies
 * sales. Demonstrates: webhook_payload variables, ai_generate, memory_put,
 * run_if conditional, and cross-step variable references.
 *
 * Run: npx tsx --env-file=.env webhook-variables-automation.ts
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
        console.log("\n--- Creating webhook lead processor ---");

        const created = await client.automations.create({
            name: "Webhook Lead Processor",
            agent_id: AGENT_ID!,
            trigger_type: "webhook",
            workflow_spec: [
                {
                    name: "analyze",
                    type: "ai_generate",
                    params: {
                        prompt: "Analyze this lead submission and classify as hot/warm/cold: Name: {{webhook_payload.name}}, Company: {{webhook_payload.company}}, Message: {{webhook_payload.message}}",
                        system_prompt:
                            'You are a lead qualification assistant. Respond with a JSON object: { "classification": "hot|warm|cold", "reason": "..." }',
                        max_tokens: 256,
                    },
                },
                {
                    type: "memory_put",
                    params: {
                        namespace: "leads",
                        key: "{{webhook_payload.email}}",
                        value: "{{steps.analyze.output}}",
                        tier: "durable",
                    },
                },
                {
                    type: "notify",
                    run_if: '{{steps.analyze.output}} contains "hot"',
                    params: {
                        channel: "email",
                        to: "sales@example.com",
                        subject: "Hot Lead: {{webhook_payload.name}}",
                        body: "New hot lead from {{webhook_payload.company}}. Analysis: {{steps.analyze.output}}",
                    },
                },
            ],
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

        console.log("\nSend a POST to the webhook URL with a JSON body like:");
        console.log(
            '  { "name": "Jane", "company": "Acme", "email": "jane@acme.com", "message": "Interested in enterprise plan" }',
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
