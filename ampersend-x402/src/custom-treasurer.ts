/**
 * 1Claw + Ampersend — Hybrid billing (credits-first, x402 fallback).
 *
 * The HybridTreasurer checks 1Claw's credit balance before authorizing
 * on-chain payment. When credits are sufficient it switches the org's
 * overage method to "credits" (no gas cost). When credits run out, it
 * falls back to signing an on-chain x402 USDC transfer.
 */

import {
    SmartAccountWallet,
    AccountWallet,
    wrapWithAmpersend,
    type Authorization,
    type PaymentContext,
    type PaymentStatus,
    type X402Treasurer,
} from "@ampersend_ai/ampersend-sdk";
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

console.log("=== 1Claw + Ampersend Hybrid Billing ===\n");

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

type PayableWallet = { createPayment(req: PaymentRequirements): Promise<{ payload: unknown }> };

/**
 * Checks 1Claw credits before authorizing on-chain payment.
 * Prefers off-chain credits when balance exceeds `creditThresholdCents`.
 */
class HybridTreasurer implements X402Treasurer {
    constructor(
        private wallet: PayableWallet,
        private creditThresholdCents = 100,
    ) {}

    async onPaymentRequired(
        requirements: ReadonlyArray<PaymentRequirements>,
        _context?: PaymentContext,
    ): Promise<Authorization | null> {
        if (requirements.length === 0) return null;

        console.log(`  [treasurer] Payment requested for ${requirements.length} requirement(s)`);

        try {
            const balanceRes = await fetch(`${BASE_URL}/v1/billing/credits/balance`, {
                headers: { Authorization: `Bearer ${JWT}` },
            });

            if (balanceRes.ok) {
                const balance = (await balanceRes.json()) as { balance_cents?: number };
                const cents = balance.balance_cents ?? 0;
                console.log(`  [treasurer] 1Claw credit balance: $${(cents / 100).toFixed(2)}`);

                if (cents >= this.creditThresholdCents) {
                    console.log(`  [treasurer] Credits sufficient — switching overage to credits`);
                    await fetch(`${BASE_URL}/v1/billing/overage-method`, {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ method: "credits" }),
                    });
                    return this.signPayment(requirements[0]);
                }

                console.log(`  [treasurer] Credits below threshold — using x402 payment`);
            }
        } catch (err) {
            console.log(`  [treasurer] Credit check failed, using x402: ${err}`);
        }

        console.log("  [treasurer] Authorizing on-chain x402 payment");
        return this.signPayment(requirements[0]);
    }

    async onStatus(
        _status: PaymentStatus,
        _authorization: Authorization,
        _context?: PaymentContext,
    ): Promise<void> {}

    private async signPayment(req: PaymentRequirements): Promise<Authorization> {
        const payment = await this.wallet.createPayment(req);
        return {
            payment: payment as Authorization["payment"],
            authorizationId: crypto.randomUUID(),
        };
    }
}

const wallet: PayableWallet = SMART_ACCOUNT
    ? new SmartAccountWallet({
          smartAccountAddress: SMART_ACCOUNT as `0x${string}`,
          sessionKeyPrivateKey: PRIVATE_KEY,
          chainId: 8453,
      })
    : AccountWallet.fromPrivateKey(PRIVATE_KEY);
const treasurer = new HybridTreasurer(wallet, 100);
const client = new x402Client();
wrapWithAmpersend(client, treasurer, ["base"]);
const paymentFetch = wrapFetchWithPayment(fetch, client);

// ── Demo ─────────────────────────────────────────────────────────────
console.log("1. Checking current credit balance...");
const balRes = await fetch(`${BASE_URL}/v1/billing/credits/balance`, {
    headers: { Authorization: `Bearer ${JWT}` },
});
if (balRes.ok) {
    const bal = (await balRes.json()) as { balance_cents?: number };
    console.log(`   Balance: $${((bal.balance_cents ?? 0) / 100).toFixed(2)}`);
} else {
    console.log(`   Could not fetch balance: ${balRes.status}`);
}

console.log("\n2. Listing secrets (with hybrid payment if over quota)...");
const res = await paymentFetch(`${BASE_URL}/v1/vaults/${VAULT_ID}/secrets`, {
    headers: { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
});
console.log(`   Status: ${res.status}`);
if (res.ok) {
    const data = (await res.json()) as { secrets?: unknown[] };
    console.log(`   Found ${data.secrets?.length ?? 0} secret(s)`);
} else {
    console.log(`   Response: ${(await res.text()).slice(0, 200)}`);
}

console.log("\nDone. The HybridTreasurer checked credits before authorizing on-chain payment.");
