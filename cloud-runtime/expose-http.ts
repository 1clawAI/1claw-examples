/**
 * 1Claw SDK — Deploy Runtime with Public HTTP Endpoint
 *
 * Creates a cloud runtime with a public HTTP endpoint exposed
 * via a custom slug. This gives the agent a stable URL that
 * external services can call (e.g. for A2A, webhooks, or APIs).
 *
 * Run: npx tsx --env-file=.env expose-http.ts
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

interface Runtime {
    id: string;
    name: string;
    agent_id: string;
    preset: string;
    status: string;
    expose_http: boolean;
    slug?: string;
    public_url?: string;
    http_port?: number;
    inbound_auth: string;
}

async function main() {
    console.log("Authenticating...");
    const client = createClient({ baseUrl: BASE_URL });
    const authRes = await client.auth.apiKeyToken({ api_key: API_KEY! });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }

    // Use a randomized slug to avoid collisions in demos
    const slug = `demo-agent-${Date.now().toString(36)}`;
    let runtimeId: string | null = null;

    try {
        // ── 1. Check slug availability ──────────────────────────────
        console.log("\n--- Checking slug availability ---");

        const slugCheck = await client.http.get<{
            slug: string;
            available: boolean;
        }>(`/v1/runtimes/slug-check/${encodeURIComponent(slug)}`);

        console.log(`  Slug: ${slugCheck.slug}`);
        console.log(`  Available: ${slugCheck.available}`);

        if (!slugCheck.available) {
            console.error("  Slug is taken. Try a different one.");
            return;
        }

        // ── 2. Create a runtime with HTTP exposure ──────────────────
        console.log("\n--- Creating runtime with HTTP endpoint ---");

        const runtime = await client.http.post<Runtime>("/v1/runtimes", {
            name: "http-agent",
            agent_id: AGENT_ID,
            preset: "small",
            expose_http: true,
            http_port: 8080,
            slug: slug,
            // "api_key" requires callers to pass the agent's API key
            // "jwt" requires a valid 1Claw JWT
            // "public" allows unauthenticated access
            inbound_auth: "api_key",
            env_public: {
                PORT: "8080",
                NODE_ENV: "production",
            },
        });

        runtimeId = runtime.id;

        console.log(`Runtime created: ${runtime.name} (${runtime.id})`);
        console.log(`  HTTP exposed: ${runtime.expose_http}`);
        console.log(`  Slug: ${runtime.slug ?? "none"}`);
        console.log(`  Port: ${runtime.http_port ?? 8080}`);
        console.log(`  Inbound auth: ${runtime.inbound_auth}`);
        if (runtime.public_url) {
            console.log(`  Public URL: ${runtime.public_url}`);
        }

        // ── 3. Start the runtime ────────────────────────────────────
        console.log("\n--- Starting runtime ---");

        const started = await client.http.post<Runtime>(
            `/v1/runtimes/${runtimeId}/start`,
        );

        console.log(`  Status: ${started.status}`);
        if (started.public_url) {
            console.log(`  Public URL: ${started.public_url}`);
            console.log("  (URL will be live once status is 'running')");
        }

        // ── 4. Update HTTP settings ─────────────────────────────────
        console.log("\n--- Updating to public auth ---");

        const updated = await client.http.patch<Runtime>(
            `/v1/runtimes/${runtimeId}`,
            { inbound_auth: "public" },
        );

        console.log(`  Inbound auth: ${updated.inbound_auth}`);

        // ── 5. Verify the runtime ───────────────────────────────────
        console.log("\n--- Runtime details ---");

        const r = await client.http.get<Runtime>(
            `/v1/runtimes/${runtimeId}`,
        );

        console.log(`  Name: ${r.name}`);
        console.log(`  Status: ${r.status}`);
        console.log(`  HTTP: ${r.expose_http}`);
        console.log(`  Slug: ${r.slug ?? "none"}`);
        console.log(`  Auth: ${r.inbound_auth}`);
        if (r.public_url) {
            console.log(`  URL: ${r.public_url}`);
        }
    } finally {
        // ── 6. Clean up ─────────────────────────────────────────────
        if (runtimeId) {
            console.log("\n--- Cleaning up ---");

            try {
                await client.http.post(`/v1/runtimes/${runtimeId}/stop`);
                console.log("  Runtime stopped.");
            } catch (e) {
                console.error("  Failed to stop:", e instanceof Error ? e.message : e);
            }

            try {
                await client.http.delete(`/v1/runtimes/${runtimeId}`);
                console.log("  Runtime deleted.");
            } catch (e) {
                console.error("  Failed to delete:", e instanceof Error ? e.message : e);
            }
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
