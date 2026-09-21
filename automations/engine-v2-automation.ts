/**
 * 1Claw SDK — Automation engine v2 (vault ≥ 0.61.45)
 *
 * One automation that uses every v2 feature and runs it end to end:
 *   - on_error: a flaky http step retries, then a failure is recorded and the
 *     run continues (`continue`)
 *   - budget: a per-run cap on cost and steps
 *   - wait_until: a short inline wait (a long one would park the run for the
 *     scheduler to wake — no wall clock spent)
 *   - awaiting_callback: the run hands {{run.callback_url}} to an external
 *     system, parks, and continues when that system POSTs back
 *   - for_each: fan-out with {{item}} / {{index}}
 *   - idempotent trigger, dry run, versions and rollback, re-run from a step
 *
 * The "external system" here is this script: it reads the callback URL from
 * the parked run's partial step results and calls it.
 *
 * Run: npx tsx --env-file=.env engine-v2-automation.ts
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!API_KEY || !AGENT_ID) {
    console.error("Set ONECLAW_API_KEY and ONECLAW_AGENT_ID in .env");
    process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const client = createClient({ baseUrl: BASE_URL });
    await client.auth.apiKeyToken({ api_key: API_KEY! });

    const spec = {
        budget: { max_cost_cents: 50, max_steps: 30 },
        steps: [
            // 1. A call that will fail (404) — retried twice, then recorded as failed and skipped past.
            {
                type: "http",
                name: "flaky",
                url: `${BASE_URL}/v1/this-does-not-exist`,
                method: "GET",
                on_error: { action: "retry", max_attempts: 2, backoff_secs: 1 },
            },
            // 2. Same, but `continue`: the run goes on and later steps can read the outcome.
            {
                type: "http",
                name: "optional",
                url: `${BASE_URL}/v1/this-does-not-exist-either`,
                method: "GET",
                on_error: "continue",
            },
            { type: "log", message: "optional step ended as {{steps.optional.status}}" },
            // 3. Hand off: an earlier step exposes the callback URL to the outside world.
            { type: "log", name: "handoff", message: "{{run.callback_url}}" },
            { type: "awaiting_callback", name: "job", params: { timeout_secs: 600 } },
            // 4. Fan out over what the callback returned.
            {
                type: "for_each",
                items: "{{resume.items}}",
                steps: [{ type: "log", message: "item {{index}} = {{item}}" }],
            },
            { type: "wait_until", params: { duration_secs: 2 } },
            { type: "log", message: "done" },
        ],
    };

    let automationId: string | null = null;
    try {
        // Preview before saving: resolved inputs, effects, warnings — nothing runs.
        const preview = await client.automations.dryRun(null, { workflowSpec: spec as never });
        console.log("dry run:", preview.data?.ok ? "no warnings" : preview.data?.warnings);

        const created = await client.automations.create({
            name: "engine v2 tour",
            agent_id: AGENT_ID!,
            trigger_type: "manual",
            workflow_spec: spec as never,
        });
        if (created.error || !created.data) throw new Error(created.error?.message ?? "create failed");
        automationId = created.data.id;
        console.log("automation", automationId, "spec v" + created.data.spec_version);

        // Step 1 is expected to fail after 2 attempts; flip it to `continue` so the tour proceeds.
        const patched = await client.automations.update(automationId, {
            workflow_spec: { ...spec, steps: [{ ...spec.steps[0], on_error: "continue" }, ...spec.steps.slice(1)] } as never,
            version_note: "let the flaky step continue",
        });
        console.log("now spec v" + patched.data?.spec_version);

        // Idempotent trigger: the same key twice returns the same run.
        const key = `tour-${Date.now()}`;
        const run1 = await client.automations.trigger(automationId, { who: "you" }, { idempotencyKey: key });
        const run2 = await client.automations.trigger(automationId, undefined, { idempotencyKey: key });
        console.log("run", run1.data?.id, "idempotent:", run1.data?.id === run2.data?.id);
        const runId = run1.data!.id;

        // Wait for the park, read the callback URL the run exposed, and answer it.
        let parked: Awaited<ReturnType<typeof client.automations.getRun>>["data"] | undefined;
        for (let i = 0; i < 40; i++) {
            await sleep(1500);
            const r = await client.automations.getRun(automationId, runId);
            if (r.data?.status === "awaiting_callback") { parked = r.data; break; }
            if (["failed", "timed_out"].includes(r.data?.status ?? "")) throw new Error(`run ${r.data?.status}: ${r.data?.error}`);
        }
        if (!parked) throw new Error("run did not park on the callback");
        const results = (parked.step_results as Array<{ name?: string; message?: string }>) ?? [];
        const url = results.find((s) => s.name === "handoff")?.message;
        console.log("parked; callback url:", url);
        const [, aid, rid, token] = url!.match(/automations\/([^/]+)\/runs\/([^/]+)\/callback\/(.+)$/)!;
        const cb = await client.automations.callback(aid, rid, token, { items: ["a", "b", "c"] });
        console.log("callback →", cb.data?.status);

        for (let i = 0; i < 40; i++) {
            await sleep(1500);
            const r = await client.automations.getRun(automationId, runId);
            if (["success", "completed_with_skips", "failed", "timed_out"].includes(r.data?.status ?? "")) {
                console.log("run finished:", r.data?.status, r.data?.error ?? "");
                const steps = r.data?.step_results as Array<{ type: string; status: string; attempts?: number; continued?: boolean; iterations?: unknown[] }>;
                for (const s of steps ?? []) console.log(`  ${s.type.padEnd(18)} ${s.status}${s.attempts ? ` ×${s.attempts}` : ""}${s.continued ? " (continued)" : ""}${s.iterations ? ` ${s.iterations.length} iterations` : ""}`);
                break;
            }
        }

        // Versions: two so far; roll back to v1 (publishes v3).
        const versions = await client.automations.listVersions(automationId);
        console.log("versions:", versions.data?.versions.map((v) => `v${v.version}${v.current ? "*" : ""}`).join(" "));
        const rolled = await client.automations.rollback(automationId, 1, { note: "tour rollback" });
        console.log("rolled back → v" + rolled.data?.spec_version);

        // Re-run from step 2 with the earlier results seeded.
        const rerun = await client.automations.rerunFromStep(automationId, runId, 2);
        console.log("re-run from step 3 →", rerun.data?.id, rerun.data?.trigger_source);
    } finally {
        if (automationId) {
            await client.automations.update(automationId, { is_active: false });
            await client.automations.delete(automationId);
            console.log("cleaned up");
        }
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
