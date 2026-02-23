/**
 * 1Claw + Ampersend — Custom Treasurer (Hybrid Billing)
 *
 * Credits first, x402 fallback. The buyer key can come from either:
 *   - BUYER_PRIVATE_KEY env var (traditional)
 *   - Fetched from a 1Claw vault at BUYER_KEY_PATH (default: "keys/x402-session-key")
 */

import {
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
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

if (!API_KEY || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
    process.exit(1);
}

console.log("=== 1Claw + Ampersend Hybrid Billing ===\n");

const PRIVATE_KEY = await resolveBuyerKey({
    apiKey: API_KEY,
    vaultId: VAULT_ID,
    baseUrl: BASE_URL,
    agentId: process.env.ONECLAW_AGENT_ID,
});

const sdk = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    agentId: process.env.ONECLAW_AGENT_ID || undefined,
});

class HybridTreasurer implements X402Treasurer {
    private wallet: AccountWallet;
    private creditThresholdCents: number;

    constructor(wallet: AccountWallet, creditThresholdCents = 100) {
        this.wallet = wallet;
        this.creditThresholdCents = creditThresholdCents;
    }

    async onPaymentRequired(
        requirements: ReadonlyArray<PaymentRequirements>,
        _context?: PaymentContext,
    ): Promise<Authorization | null> {
        if (requirements.length === 0) return null;

        console.log(
            `  [treasurer] Payment requested for ${requirements.length} requirement(s)`,
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
                        `  [treasurer] Credits sufficient — switching overage method to credits`,
                    );

                    await fetch(`${BASE_URL}/v1/billing/overage-method`, {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${API_KEY}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ method: "credits" }),
                    });

                    const payment = await this.wallet.createPayment(requirements[0]);
                    return {
                        payment: payment as Authorization["payment"],
                        authorizationId: crypto.randomUUID(),
                    };
                }

                console.log(
                    `  [treasurer] Credits below threshold — using x402 payment`,
                );
            }
        } catch (err) {
            console.log(
                `  [treasurer] Credit check failed, using x402: ${err}`,
            );
        }

        console.log("  [treasurer] Authorizing on-chain x402 payment via wallet");
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

const wallet = AccountWallet.fromPrivateKey(PRIVATE_KEY);
const treasurer = new HybridTreasurer(wallet, 100);
const client = new x402Client();
wrapWithAmpersend(client, treasurer, ["base"]);
const paymentFetch = wrapFetchWithPayment(fetch, client);

console.log("\n1. Checking current credit balance...");
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
