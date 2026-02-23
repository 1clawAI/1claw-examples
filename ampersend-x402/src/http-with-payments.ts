/**
 * 1Claw + Ampersend — HTTP client with x402 payments (v1 protocol).
 *
 * Uses AmpersendTreasurer (recommended) with SmartAccountWallet: consults
 * the Ampersend API for payment authorization, enforces limits, and reports
 * payment activity. When a request returns 402, the wrapper retries with
 * signed payment after the treasurer approves.
 *
 * The buyer key can come from BUYER_PRIVATE_KEY (Option A) or from a 1Claw
 * vault at BUYER_KEY_PATH (Option B). Requires SMART_ACCOUNT_ADDRESS.
 */

import { createAmpersendTreasurer, wrapWithAmpersend } from "@ampersend_ai/ampersend-sdk";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createClient } from "@1claw/sdk";
import { resolveBuyerKey } from "./resolve-buyer-key.js";

const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const SMART_ACCOUNT = process.env.SMART_ACCOUNT_ADDRESS;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const AMPERSEND_API_URL = process.env.AMPERSEND_API_URL;

if (!API_KEY || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
    process.exit(1);
}
if (!SMART_ACCOUNT) {
    console.error("Required: SMART_ACCOUNT_ADDRESS (AmpersendTreasurer uses Smart Account)");
    process.exit(1);
}

console.log("=== 1Claw + Ampersend HTTP Client ===\n");

const sdk = createClient({ baseUrl: BASE_URL });
const authRes = AGENT_ID
    ? await sdk.auth.agentToken({ api_key: API_KEY, agent_id: AGENT_ID })
    : await sdk.auth.apiKeyToken({ api_key: API_KEY });
if (authRes.error) {
    console.error(`Auth failed: ${authRes.error.message}`);
    process.exit(1);
}
const JWT = authRes.data!.access_token;

const PRIVATE_KEY = await resolveBuyerKey({
    apiKey: API_KEY,
    vaultId: VAULT_ID,
    baseUrl: BASE_URL,
    agentId: AGENT_ID,
});

const treasurer = createAmpersendTreasurer({
    smartAccountAddress: SMART_ACCOUNT as `0x${string}`,
    sessionKeyPrivateKey: PRIVATE_KEY,
    chainId: 8453,
    ...(AMPERSEND_API_URL && { apiUrl: AMPERSEND_API_URL }),
});
const client = new x402Client();
wrapWithAmpersend(client, treasurer, ["base"]);
const paymentFetch = wrapFetchWithPayment(fetch, client);

// ── Demo: SDK call ──────────────────────────────────────────────────
console.log("1. Listing secrets via SDK...");
const secrets = await sdk.secrets.list(VAULT_ID);
if (secrets.error) {
    console.log(`   Error: ${secrets.error.message}`);
} else {
    console.log(`   Found ${secrets.data!.secrets.length} secret(s)`);
    for (const s of secrets.data!.secrets) {
        console.log(`   - ${s.path} (${s.type}, v${s.version})`);
    }
}

// ── Demo: raw fetch with x402 payment wrapping ──────────────────────
console.log("\n2. Direct API call with payment-aware fetch...");
console.log("   (If quota exceeded, payment is handled automatically)\n");

const res = await paymentFetch(`${BASE_URL}/v1/vaults/${VAULT_ID}/secrets`, {
    headers: {
        Authorization: `Bearer ${JWT}`,
        "Content-Type": "application/json",
    },
});

console.log(`   Status: ${res.status}`);

if (res.ok) {
    const data = await res.json();
    console.log(`   Secrets: ${JSON.stringify(data, null, 2).slice(0, 200)}...`);
} else {
    const text = await res.text();
    console.log(`   Response: ${text.slice(0, 200)}`);
}

console.log("\n3. Checking response headers for billing info:");
for (const h of ["X-RateLimit-Requests-Used", "X-RateLimit-Requests-Limit", "X-Credit-Balance-Cents", "X-Overage-Method"]) {
    const val = res.headers.get(h);
    if (val) console.log(`   ${h}: ${val}`);
}

console.log("\nDone.");
