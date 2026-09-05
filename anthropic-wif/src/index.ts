/**
 * Anthropic Workload Identity Federation — end-to-end demo.
 *
 *  1. Provision a 1claw agent with federation_enabled and an audience allowlist.
 *  2. Mint an RS256 OIDC JWT via POST /v1/auth/federated-token.
 *  3. Verify the token's `kid` resolves against /.well-known/jwks.json.
 *  4. Exchange the JWT at Anthropic's WIF token endpoint (skippable in CI).
 *  5. Call the Claude API with the resulting sk-ant-oat01-… token.
 *  6. Always clean up the demo agent on exit.
 */

import { createClient, type OneclawClient } from "@1claw/sdk";

const ONECLAW_API_KEY = required("ONECLAW_API_KEY");
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const AUDIENCE = process.env.WIF_AUDIENCE ?? "https://api.anthropic.com";
const SKIP_ANTHROPIC = process.env.DEMO_SKIP_ANTHROPIC === "1";
const ANTHROPIC_TOKEN_URL =
    process.env.ANTHROPIC_WIF_TOKEN_URL ??
    "https://api.anthropic.com/v1/oauth/token";
const TTL_SECONDS = 900;

interface JwtHeader {
    alg: string;
    kid?: string;
    typ?: string;
}

interface JwtPayload {
    iss: string;
    sub: string;
    aud: string;
    exp: number;
    iat: number;
    jti?: string;
    scopes?: string[];
}

interface JwksDoc {
    keys: Array<{ kid: string; alg: string; kty: string }>;
}

function required(name: string): string {
    const v = process.env[name];
    if (!v) {
        console.error(`Missing required env var: ${name}`);
        process.exit(2);
    }
    return v;
}

function decodeBase64Url(input: string): Buffer {
    const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
    return Buffer.from(
        padded.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
    );
}

function decodeJwt<T>(token: string): T {
    const segs = token.split(".");
    if (segs.length !== 3) throw new Error("Malformed JWT");
    return JSON.parse(decodeBase64Url(segs[1]).toString("utf8")) as T;
}

function decodeJwtHeader(token: string): JwtHeader {
    const segs = token.split(".");
    if (segs.length !== 3) throw new Error("Malformed JWT");
    return JSON.parse(decodeBase64Url(segs[0]).toString("utf8")) as JwtHeader;
}

async function provisionAgent(client: OneclawClient): Promise<{
    agentId: string;
    apiKey: string;
}> {
    const res = await client.agents.create({
        name: `anthropic-wif-demo-${Date.now()}`,
        description:
            "Anthropic WIF demo agent — federation_enabled, narrow audience allowlist.",
        auth_method: "api_key",
        federation_enabled: true,
        federation_audiences: [AUDIENCE],
        federated_token_ttl_seconds: TTL_SECONDS,
    });
    if (res.error || !res.data) {
        throw new Error(
            `Failed to create agent: ${res.error?.message ?? "unknown"}`,
        );
    }
    if (!res.data.api_key) {
        throw new Error("Agent created but no API key returned.");
    }
    return { agentId: res.data.agent.id, apiKey: res.data.api_key };
}

async function mintFederatedToken(apiKey: string): Promise<string> {
    // Use a fresh client carrying the agent's API key. The SDK will
    // auto-exchange that for an agent JWT, then we'll use the same
    // client to call exchangeFederatedToken().
    const agentClient = createClient({ baseUrl: BASE_URL, apiKey });
    const res = await agentClient.auth.exchangeFederatedToken({
        audience: AUDIENCE,
    });
    if (res.error || !res.data) {
        throw new Error(
            `exchangeFederatedToken failed: ${res.error?.message ?? "unknown"}`,
        );
    }
    return res.data.access_token;
}

async function verifyKidPublishedInJwks(token: string): Promise<string> {
    const header = decodeJwtHeader(token);
    if (!header.kid) {
        throw new Error("Federated JWT is missing `kid` header");
    }
    if (header.alg !== "RS256") {
        throw new Error(
            `Expected alg=RS256, got ${header.alg}. JWKS-published RS256 is what Anthropic verifies against.`,
        );
    }

    const jwksRes = await fetch(`${BASE_URL}/.well-known/jwks.json`);
    if (!jwksRes.ok) {
        throw new Error(`JWKS fetch failed: HTTP ${jwksRes.status}`);
    }
    const jwks = (await jwksRes.json()) as JwksDoc;
    const match = jwks.keys.find((k) => k.kid === header.kid);
    if (!match) {
        throw new Error(
            `kid '${header.kid}' not found in JWKS (${jwks.keys.length} keys published). Vault deployment may be ahead of JWKS publishing — wait a moment and retry.`,
        );
    }
    return header.kid;
}

async function exchangeAtAnthropic(jwt: string): Promise<{
    accessToken: string;
    expiresIn: number;
}> {
    const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
    });
    const res = await fetch(ANTHROPIC_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `Anthropic WIF token exchange failed: HTTP ${res.status} — ${text.slice(0, 400)}`,
        );
    }
    const json = (await res.json()) as {
        access_token: string;
        expires_in: number;
    };
    return { accessToken: json.access_token, expiresIn: json.expires_in };
}

async function callClaude(accessToken: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 64,
            messages: [
                {
                    role: "user",
                    content:
                        "Reply with exactly the phrase: 'Hello from 1claw!' (no quotes).",
                },
            ],
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `Claude call failed: HTTP ${res.status} — ${text.slice(0, 400)}`,
        );
    }
    const json = (await res.json()) as {
        content: Array<{ type: string; text?: string }>;
    };
    return json.content?.[0]?.text ?? "(no text)";
}

async function cleanup(
    client: OneclawClient,
    agentId: string | null,
): Promise<void> {
    if (!agentId) return;
    const res = await client.agents.delete(agentId);
    if (res.error) {
        console.warn(
            `[cleanup] Failed to delete agent ${agentId}: ${res.error.message}`,
        );
        return;
    }
    console.log(`[cleanup] Deleted agent ${agentId}`);
}

async function main(): Promise<void> {
    const client = createClient({ baseUrl: BASE_URL, apiKey: ONECLAW_API_KEY });
    let agentId: string | null = null;
    let exitCode = 0;

    const onSignal = (sig: NodeJS.Signals) => {
        console.log(`\n[signal] ${sig} — cleaning up…`);
        cleanup(client, agentId)
            .catch((e) => console.warn("[cleanup] error:", e))
            .finally(() => process.exit(130));
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
        // Step 1 — provision agent with federation enabled.
        const provisioned = await provisionAgent(client);
        agentId = provisioned.agentId;
        console.log(
            `[1] Created demo agent ${provisioned.agentId} with federation_enabled=true, audiences=[${AUDIENCE}], ttl=${TTL_SECONDS}s`,
        );

        // Step 2 — exchange agent credential for an RS256 federation JWT.
        const federatedJwt = await mintFederatedToken(provisioned.apiKey);
        const header = decodeJwtHeader(federatedJwt);
        const payload = decodeJwt<JwtPayload>(federatedJwt);
        console.log(
            `[2] Exchanged 1claw credential → federated JWT (alg=${header.alg}, kid=${header.kid}, sub=${payload.sub}, aud=${payload.aud})`,
        );

        // Sanity-check the issuer + audience claims so a misconfigured
        // VAULT_PUBLIC_URL doesn't silently confuse the relying party.
        if (payload.aud !== AUDIENCE) {
            throw new Error(
                `Token aud (${payload.aud}) doesn't match requested audience (${AUDIENCE})`,
            );
        }
        if (!payload.iss.startsWith("https://")) {
            throw new Error(
                `Token iss is not an https URL: ${payload.iss}. Anthropic WIF requires https.`,
            );
        }

        // Step 3 — confirm kid resolves in the public JWKS.
        const kid = await verifyKidPublishedInJwks(federatedJwt);
        console.log(
            `[3] Verified kid '${kid}' is published at ${BASE_URL}/.well-known/jwks.json`,
        );

        // Step 4 — exchange at Anthropic. Skippable for CI.
        if (SKIP_ANTHROPIC) {
            console.log(
                `[4] DEMO_SKIP_ANTHROPIC=1 — skipping Anthropic exchange + Claude call.`,
            );
            console.log(
                `\nFederated JWT (truncated): ${federatedJwt.slice(0, 80)}…`,
            );
            return;
        }

        const { accessToken, expiresIn } = await exchangeAtAnthropic(
            federatedJwt,
        );
        console.log(
            `[4] Exchanged federated JWT at Anthropic → ${accessToken.slice(0, 24)}… (expires_in=${expiresIn}s)`,
        );

        // Step 5 — call Claude with the upstream token.
        const reply = await callClaude(accessToken);
        console.log(`[5] Claude responded: "${reply.trim()}"`);
    } catch (err) {
        exitCode = 1;
        console.error(
            "\n[error]",
            err instanceof Error ? err.message : String(err),
        );
    } finally {
        await cleanup(client, agentId);
        process.exit(exitCode);
    }
}

main();
