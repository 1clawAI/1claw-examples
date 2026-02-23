/**
 * 1Claw + Ampersend — HTTP client with x402 payments (v1 protocol).
 *
 * Wraps fetch() with the Ampersend x402 payment layer. When a request
 * returns 402, the wrapper consults the treasurer, signs payment with
 * the wallet, and retries automatically.
 *
 * The buyer key can come from either:
 *   - BUYER_PRIVATE_KEY env var (direct)
 *   - Fetched from a 1Claw vault at BUYER_KEY_PATH
 */

import { SmartAccountWallet, AccountWallet, wrapWithAmpersend } from "@ampersend_ai/ampersend-sdk";
import type { Authorization, PaymentContext, PaymentStatus, X402Treasurer } from "@ampersend_ai/ampersend-sdk";
import type { PaymentRequirements } from "x402/types";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createClient } from "@1claw/sdk";
import { resolveBuyerKey } from "./resolve-buyer-key.js";

const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const SMART_ACCOUNT = process.env.SMART_ACCOUNT_ADDRESS;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

if (!API_KEY || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
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

/** Approves every payment request — use spend-limited treasurer in production. */
class NaiveTreasurer implements X402Treasurer {
    constructor(private wallet: { createPayment(req: PaymentRequirements): Promise<{ payload: unknown }> }) {}
    async onPaymentRequired(
        requirements: ReadonlyArray<PaymentRequirements>,
        _context?: PaymentContext,
    ): Promise<Authorization | null> {
        if (requirements.length === 0) return null;
        const payment = await this.wallet.createPayment(requirements[0]);
        return {
            payment: payment as Authorization["payment"],
            authorizationId: crypto.randomUUID(),
        };
    }
    async onStatus(
        _status: PaymentStatus,
        _authorization: Authorization,
        _context?: PaymentContext,
    ): Promise<void> {}
}

const wallet = SMART_ACCOUNT
    ? new SmartAccountWallet({
          smartAccountAddress: SMART_ACCOUNT as `0x${string}`,
          sessionKeyPrivateKey: PRIVATE_KEY,
          chainId: 8453,
      })
    : AccountWallet.fromPrivateKey(PRIVATE_KEY);
const treasurer = new NaiveTreasurer(wallet);
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
