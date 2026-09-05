/**
 * 1Claw SDK — AI Generate Automation
 *
 * Creates a cron-scheduled automation that uses the ai_generate step to
 * produce content, saves it to agent memory, and sends an email notification.
 * Demonstrates: ai_generate, memory_put, notify steps, and template variables.
 *
 * Run: npx tsx --env-file=.env ai-generate-automation.ts
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
        console.log("\n--- Creating AI generate automation ---");

        const created = await client.automations.create({
            name: "Weekly Content Draft",
            agent_id: AGENT_ID!,
            trigger_type: "cron",
            cron_expr: "0 9 * * 1",
            workflow_spec: [
                {
                    name: "generate_draft",
                    type: "ai_generate",
                    params: {
                        prompt: "Write a concise weekly newsletter intro about AI agent security trends. 2-3 paragraphs.",
                        system_prompt: "You are a cybersecurity content writer.",
                        max_tokens: 1024,
                    },
                },
                {
                    name: "save_draft",
                    type: "memory_put",
                    params: {
                        namespace: "content",
                        key: "latest-draft",
                        value: "{{steps.generate_draft.output}}",
                        tier: "durable",
                    },
                },
                {
                    type: "notify",
                    params: {
                        channel: "email",
                        to: "content-team@example.com",
                        subject: "Weekly Draft Ready",
                        body: "A new content draft has been generated and saved to agent memory.",
                    },
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
        if (automation.next_run_at) {
            console.log(`  Next run: ${automation.next_run_at}`);
        }

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
