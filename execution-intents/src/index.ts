/**
 * Execution Intents — Full walkthrough
 *
 * Demonstrates:
 *  1. Creating an agent with execution_intents_enabled
 *  2. Creating HTTP and GraphQL bindings with inline credentials
 *  3. Creating a vault-ref binding (live pointer to existing secret)
 *  4. Testing binding connectivity
 *  5. Executing requests through bindings (agent never sees credentials)
 *  6. Applying guardrails (allowed_hosts, rate limits)
 *  7. Viewing execution history
 *  8. Credential rotation without agent downtime
 *  9. Cleanup
 *
 * Run: npm start (requires .env with ONECLAW_API_KEY)
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = (process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz").replace(/\/$/, "");
const USER_KEY = process.env.ONECLAW_API_KEY?.trim();

if (!USER_KEY) {
    console.error("Set ONECLAW_API_KEY in .env (a human 1ck_ key with Pro+ tier).");
    process.exit(1);
}

const client = createClient({ baseUrl: BASE_URL, apiKey: USER_KEY });

function ok(msg: string) { console.log(`  ✓ ${msg}`); }
function note(msg: string) { console.log(`  · ${msg}`); }
function fail(msg: string): never { console.error(`  ✗ ${msg}`); process.exit(1); }

function isExpectedError(err: unknown, ...statuses: number[]): boolean {
    if (typeof err === "object" && err !== null && "status" in err) {
        return statuses.includes((err as { status: number }).status);
    }
    return false;
}

async function main() {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  Execution Intents — Full Walkthrough");
    console.log("  API:", BASE_URL);
    console.log("═══════════════════════════════════════════════════════════\n");

    // ─── 1. Create an agent with Execution Intents enabled ───
    console.log("── 1. Create agent with execution_intents_enabled ──");
    const agentRes = await client.agents.create({
        name: `exec-intents-demo-${Date.now()}`,
        description: "Execution Intents walkthrough agent",
        execution_intents_enabled: true,
        execution_guardrails: {
            allowed_hosts: ["api.github.com", "*.openweathermap.org", "httpbin.org"],
            max_duration_ms: 10000,
            max_requests_per_minute: 30,
        },
    });
    if (!agentRes.data) fail("Failed to create agent");
    const agent = agentRes.data.agent;
    const agentApiKey = agentRes.data.api_key;
    ok(`Agent created: ${agent.id.slice(0, 8)}… (execution_intents_enabled=${agent.execution_intents_enabled})`);
    note(`Agent API key: ${agentApiKey?.slice(0, 12)}…`);
    note(`Guardrails: allowed_hosts=${JSON.stringify(agent.execution_guardrails?.allowed_hosts)}`);

    // ─── 2. Create an HTTP binding (httpbin echo) ───
    console.log("\n── 2. Create HTTP binding (httpbin.org — no credential) ──");
    const httpbinRes = await client.bindings.create(agent.id, {
        name: "httpbin-echo",
        binding_type: "http",
        config: {
            base_url: "https://httpbin.org",
        },
        guardrails: {
            allowed_hosts: ["httpbin.org"],
            allowed_paths: ["/get*", "/post*", "/headers*"],
        },
    });
    if (!httpbinRes.data) fail("Failed to create httpbin binding");
    const httpbinBinding = httpbinRes.data;
    ok(`Binding "${httpbinBinding.name}" created (id=${httpbinBinding.id.slice(0, 8)}…, type=${httpbinBinding.binding_type})`);
    note(`credential_set=${httpbinBinding.credential_set} (no credential needed for httpbin)`);

    // ─── 3. Create an HTTP binding with a credential ───
    console.log("\n── 3. Create HTTP binding with bearer credential ──");
    const githubToken = process.env.GITHUB_TOKEN?.trim();
    let githubBindingId: string | null = null;

    if (githubToken) {
        const githubRes = await client.bindings.create(agent.id, {
            name: "github-api",
            binding_type: "http",
            config: {
                base_url: "https://api.github.com",
                headers: { Accept: "application/vnd.github+json" },
            },
            credential: { type: "bearer", token: githubToken },
            guardrails: {
                allowed_hosts: ["api.github.com"],
                allowed_paths: ["/user*", "/repos*", "/orgs*"],
            },
        });
        if (!githubRes.data) fail("Failed to create GitHub binding");
        githubBindingId = githubRes.data.id;
        ok(`Binding "${githubRes.data.name}" created (credential_set=${githubRes.data.credential_set})`);
        note("The agent can call GitHub but never sees the token");
    } else {
        note("Skipping GitHub binding (set GITHUB_TOKEN in .env)");
    }

    // ─── 4. Create a GraphQL binding ───
    console.log("\n── 4. Create GraphQL binding (Countries API — public) ──");
    const gqlRes = await client.bindings.create(agent.id, {
        name: "countries-graphql",
        binding_type: "graphql",
        config: {
            base_url: "https://countries.trevorblades.com/graphql",
        },
        guardrails: {
            allowed_hosts: ["countries.trevorblades.com"],
        },
    });
    if (!gqlRes.data) fail("Failed to create GraphQL binding");
    ok(`Binding "${gqlRes.data.name}" created (type=graphql)`);

    // ─── 5. Test binding connectivity ───
    console.log("\n── 5. Test binding connectivity ──");
    const testRes = await client.bindings.test(agent.id, httpbinBinding.id);
    if (testRes.data) {
        ok(`httpbin-echo connectivity: success=${testRes.data.success}, latency=${testRes.data.latency_ms}ms`);
    } else {
        note("Test returned no data (SSRF or network issue)");
    }

    const gqlTestRes = await client.bindings.test(agent.id, gqlRes.data!.id);
    if (gqlTestRes.data) {
        ok(`countries-graphql connectivity: success=${gqlTestRes.data.success}, latency=${gqlTestRes.data.latency_ms}ms`);
    }

    // ─── 6. Execute HTTP request through binding ───
    console.log("\n── 6. Execute HTTP request (httpbin /get) ──");

    // Exchange agent token for execution
    const agentClient = createClient({
        baseUrl: BASE_URL,
        apiKey: agentApiKey!,
    });

    const execHttpRes = await agentClient.bindings.execute(agent.id, {
        binding: "httpbin-echo",
        intent_type: "http",
        params: {
            method: "GET",
            path: "/get",
            query: { demo: "execution-intents" },
        },
    });
    if (execHttpRes.data) {
        ok(`Execute HTTP → status=${execHttpRes.data.status}, duration=${execHttpRes.data.duration_ms}ms`);
        ok(`execution_surface=${execHttpRes.data.execution_surface}`);
        const origin = (execHttpRes.data.result as Record<string, unknown>)?.origin;
        if (origin) note(`httpbin saw origin: ${origin} (request came from 1claw, not the agent)`);
    } else {
        note("HTTP execute returned no data");
    }

    // ─── 7. Execute GraphQL query through binding ───
    console.log("\n── 7. Execute GraphQL query (countries) ──");
    const execGqlRes = await agentClient.bindings.execute(agent.id, {
        binding: "countries-graphql",
        intent_type: "graphql",
        params: {
            query: `{ countries(filter: { code: { eq: "US" } }) { name capital currency } }`,
        },
    });
    if (execGqlRes.data) {
        ok(`Execute GraphQL → status=${execGqlRes.data.status}, duration=${execGqlRes.data.duration_ms}ms`);
        const countries = (execGqlRes.data.result as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        if (countries?.countries) note(`Result: ${JSON.stringify(countries.countries)}`);
    } else {
        note("GraphQL execute returned no data");
    }

    // ─── 8. Execute with GitHub credential (if configured) ───
    if (githubBindingId) {
        console.log("\n── 8. Execute GitHub API call (credential injected server-side) ──");
        const execGhRes = await agentClient.bindings.execute(agent.id, {
            binding: "github-api",
            intent_type: "http",
            params: {
                method: "GET",
                path: "/user",
            },
        });
        if (execGhRes.data) {
            ok(`Execute GitHub → status=${execGhRes.data.status}`);
            const login = (execGhRes.data.result as Record<string, unknown>)?.login;
            if (login) ok(`Authenticated as: ${login} (token was never visible to agent)`);
        }
    } else {
        console.log("\n── 8. Skipping GitHub execute (no GITHUB_TOKEN) ──");
        note("Set GITHUB_TOKEN in .env to see credential injection in action");
    }

    // ─── 9. Guardrail enforcement — blocked host ───
    console.log("\n── 9. Guardrail enforcement (blocked host) ──");
    try {
        await agentClient.bindings.execute(agent.id, {
            binding: "httpbin-echo",
            intent_type: "http",
            params: {
                method: "GET",
                url: "https://evil.com/steal-data",
            },
        });
        note("Request went through (binding-level guardrails may differ from agent-level)");
    } catch (err) {
        if (isExpectedError(err, 403)) {
            ok("Blocked by guardrails: host not in allowed_hosts → 403");
        } else if (isExpectedError(err, 400)) {
            ok("Rejected: invalid request for binding guardrails → 400");
        } else {
            throw err;
        }
    }

    // ─── 10. View execution history ───
    console.log("\n── 10. Execution history ──");
    const historyRes = await client.bindings.listExecutions(agent.id, { limit: 5 });
    if (historyRes.data) {
        ok(`${historyRes.data.events.length} events in execution log`);
        for (const ev of historyRes.data.events.slice(0, 3)) {
            note(`  ${ev.status} | ${ev.intent_type} | binding=${ev.binding_id.slice(0, 8)}… | ${ev.duration_ms}ms`);
        }
    }

    // ─── 11. Credential rotation ───
    console.log("\n── 11. Credential rotation (zero-downtime) ──");
    if (githubBindingId) {
        await client.bindings.rotateCredential(agent.id, githubBindingId, {
            credential: { type: "bearer", token: "ghp_rotated_example_token" },
        });
        ok("Credential rotated — agent continues working, never saw either token value");
    } else {
        const rotateRes = await client.bindings.rotateCredential(agent.id, httpbinBinding.id, {
            credential: { type: "header", name: "X-Demo-Key", value: "rotated-value" },
        });
        ok(`Credential rotated on httpbin binding (credential_set=${rotateRes.data?.credential_set})`);
    }

    // ─── 12. List bindings ───
    console.log("\n── 12. List all bindings ──");
    const listRes = await client.bindings.list(agent.id);
    if (listRes.data) {
        ok(`${listRes.data.bindings.length} binding(s) configured:`);
        for (const b of listRes.data.bindings) {
            note(`  ${b.name} (${b.binding_type}) — credential_set=${b.credential_set}, active=${b.is_active}`);
        }
    }

    // ─── Cleanup ───
    console.log("\n── Cleanup ──");
    await client.agents.delete(agent.id);
    ok(`Agent ${agent.id.slice(0, 8)}… deleted (bindings auto-purged)`);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  Done! Execution Intents walkthrough complete.");
    console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
});
