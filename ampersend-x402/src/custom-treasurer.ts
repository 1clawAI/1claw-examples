/**
 * 1Claw + Ampersend — Custom Treasurer (Hybrid Billing)
 *
 * A custom X402Treasurer that checks 1Claw's prepaid credit balance
 * before falling through to on-chain payment. This implements a
 * "credits first, x402 fallback" strategy:
 *
 *   1. API call exceeds quota → 402 Payment Required
 *   2. Custom Treasurer checks 1Claw credit balance
 *   3. If credits available → uses credits (no on-chain payment)
 *   4. If credits depleted → falls through to Ampersend wallet payment
 *
 * This demonstrates the most advanced integration pattern: combining
 * 1Claw's credit system with Ampersend's on-chain payment layer.
 */

import {
    AccountWallet,
    type X402Treasurer,
    type Authorization,
    type PaymentContext,
} from "@ampersend_ai/ampersend-sdk";
import { wrapWithAmpersend } from "@ampersend_ai/ampersend-sdk/x402/http";
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

const sdk = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    agentId: process.env.ONECLAW_AGENT_ID || undefined,
});

// ── Custom Treasurer: credits first, x402 fallback ──────────────────

class HybridTreasurer implements X402Treasurer {
    private wallet: AccountWallet;
    private creditThresholdCents: number;

    constructor(wallet: AccountWallet, creditThresholdCents = 100) {
        this.wallet = wallet;
        this.creditThresholdCents = creditThresholdCents;
    }

    async authorize(context: PaymentContext): Promise<Authorization> {
        console.log(
            `  [treasurer] Payment requested: ${context.paymentRequirements?.scheme ?? "unknown"} ` +
                `for ${context.paymentRequirements?.maxAmountRequired ?? "?"} units`,
        );

        try {
            const balanceRes = await fetch(
                `${BASE_URL}/v1/billing/credits/balance`,
                {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                },
            );

            if (balanceRes.ok) {
                const balance = await balanceRes.json();
                const cents = balance.balance_cents ?? 0;
                console.log(
                    `  [treasurer] 1Claw credit balance: $${(cents / 100).toFixed(2)}`,
                );

                if (cents >= this.creditThresholdCents) {
                    console.log(
                        `  [treasurer] Credits sufficient (>$${(this.creditThresholdCents / 100).toFixed(2)}) — ` +
                            "switching overage method to credits",
                    );

                    await fetch(`${BASE_URL}/v1/billing/overage-method`, {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${API_KEY}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ method: "credits" }),
                    });

                    return {
                        approved: true,
                        reason: `Using 1Claw credits ($${(cents / 100).toFixed(2)} available)`,
                    };
                }

                console.log(
                    `  [treasurer] Credits below threshold — falling through to x402 payment`,
                );
            }
        } catch (err) {
            console.log(
                `  [treasurer] Credit check failed, using x402: ${err}`,
            );
        }

        console.log(
            "  [treasurer] Authorizing on-chain x402 payment via wallet",
        );
        return {
            approved: true,
            reason: "Approved for on-chain x402 payment",
        };
    }
}

// ── Set up hybrid payment client ────────────────────────────────────

console.log("=== 1Claw + Ampersend Hybrid Billing ===\n");

const wallet = new AccountWallet(PRIVATE_KEY as `0x${string}`);
const treasurer = new HybridTreasurer(wallet, 100);

const paymentFetch = wrapWithAmpersend(fetch, {
    wallet,
    treasurer,
});

// ── Demo: make API calls ────────────────────────────────────────────

console.log("1. Checking current credit balance...");
const balRes = await fetch(`${BASE_URL}/v1/billing/credits/balance`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
});
if (balRes.ok) {
    const bal = await balRes.json();
    console.log(
        `   Balance: $${((bal.balance_cents ?? 0) / 100).toFixed(2)} ` +
            `(${bal.balance_cents ?? 0} cents)`,
    );
} else {
    console.log(`   Could not fetch balance: ${balRes.status}`);
}

console.log("\n2. Listing secrets (with hybrid payment if over quota)...");
const res = await paymentFetch(`${BASE_URL}/v1/vaults/${VAULT_ID}/secrets`, {
    headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
    },
});

console.log(`   Status: ${res.status}`);
if (res.ok) {
    const data = await res.json();
    const secrets = data.secrets ?? [];
    console.log(`   Found ${secrets.length} secret(s)`);
} else {
    console.log(`   Response: ${(await res.text()).slice(0, 200)}`);
}

console.log("\n3. Current billing state:");
const ovRes = await fetch(`${BASE_URL}/v1/billing/overage-method`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
});
if (ovRes.ok) {
    const ov = await ovRes.json();
    console.log(`   Overage method: ${ov.method ?? "unknown"}`);
}

console.log(
    "\nDone. The HybridTreasurer checked credits before authorizing " +
        "on-chain payment.",
);
console.log(
    "In production, configure a daily/monthly budget using " +
        "createAmpersendTreasurer().",
);
