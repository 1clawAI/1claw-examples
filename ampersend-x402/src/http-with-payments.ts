/**
 * 1Claw + Ampersend — HTTP Client with x402 Payments
 *
 * Lower-level approach: wraps the standard fetch() with Ampersend's
 * payment layer. When a request returns 402, the wrapper automatically
 * handles payment and retries.
 *
 * This approach works with the 1Claw REST API directly (no MCP).
 */

import { createAmpersendHttpClient } from "@ampersend_ai/ampersend-sdk";
import { wrapWithAmpersend } from "@ampersend_ai/ampersend-sdk/x402/http";
import { AccountWallet } from "@ampersend_ai/ampersend-sdk";
import { NaiveTreasurer } from "@ampersend_ai/ampersend-sdk/x402/treasurers";
import { createClient } from "@1claw/sdk";

const PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

if (!PRIVATE_KEY || !API_KEY || !VAULT_ID) {
    console.error(
        "Required: BUYER_PRIVATE_KEY, ONECLAW_API_KEY, ONECLAW_VAULT_ID",
    );
    process.exit(1);
}

console.log("=== 1Claw + Ampersend HTTP Client ===\n");

// ── Set up payment-aware fetch ──────────────────────────────────────

const wallet = new AccountWallet(PRIVATE_KEY as `0x${string}`);
const treasurer = new NaiveTreasurer(wallet);

const paymentFetch = wrapWithAmpersend(fetch, {
    wallet,
    treasurer,
});

// ── Use the 1Claw SDK with payment-aware fetch ─────────────────────

const sdk = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    agentId: process.env.ONECLAW_AGENT_ID || undefined,
});

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

// ── Direct HTTP call with payment wrapping ──────────────────────────

console.log("\n2. Direct API call with payment-aware fetch...");
console.log("   (If quota exceeded, payment is handled automatically)\n");

const res = await paymentFetch(`${BASE_URL}/v1/vaults/${VAULT_ID}/secrets`, {
    headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
    },
});

console.log(`   Status: ${res.status}`);

if (res.ok) {
    const data = await res.json();
    console.log(
        `   Secrets: ${JSON.stringify(data, null, 2).slice(0, 200)}...`,
    );
} else {
    const text = await res.text();
    console.log(`   Response: ${text.slice(0, 200)}`);
}

// ── Check payment headers ───────────────────────────────────────────

console.log("\n3. Checking response headers for billing info:");
const headers = [
    "X-RateLimit-Requests-Used",
    "X-RateLimit-Requests-Limit",
    "X-RateLimit-Requests-Percent",
    "X-Credit-Balance-Cents",
    "X-Overage-Method",
];
for (const h of headers) {
    const val = res.headers.get(h);
    if (val) console.log(`   ${h}: ${val}`);
}

console.log("\nDone.");
