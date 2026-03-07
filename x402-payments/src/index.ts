/**
 * 1Claw x402 payments example — real micropayments for supported endpoints.
 *
 * Uses an EOA private key from X402_PRIVATE_KEY (.env) to sign x402 payments
 * when the API returns 402 (e.g. over free-tier quota). Demonstrates each
 * x402-capable endpoint: secrets (get/put), share access, audit events,
 * and optional transaction simulate.
 *
 * Prerequisites:
 * - ONECLAW_API_KEY, ONECLAW_VAULT_ID (and ONECLAW_AGENT_ID for Intents demos)
 * - X402_PRIVATE_KEY: EOA private key (0x-prefixed hex). Wallet should hold
 *   USDC on Base for real payments when quota is exceeded.
 *
 * Run: npm start
 */

import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const X402_PRIVATE_KEY = process.env.X402_PRIVATE_KEY;

if (!API_KEY || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
    process.exit(1);
}
if (!X402_PRIVATE_KEY || !X402_PRIVATE_KEY.startsWith("0x")) {
    console.error(
        "Required: X402_PRIVATE_KEY (0x-prefixed hex). Generate and add to .env for real x402 payments.",
    );
    process.exit(1);
}

async function main() {
    console.log("=== 1Claw x402 payments example ===\n");

    const sdk = createClient({ baseUrl: BASE_URL });
    const authRes = AGENT_ID
        ? await sdk.auth.agentToken({ api_key: API_KEY, agent_id: AGENT_ID })
        : await sdk.auth.apiKeyToken({ api_key: API_KEY });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }
    const JWT = authRes.data!.access_token;

    const account = privateKeyToAccount(X402_PRIVATE_KEY as `0x${string}`);
    const publicClient = createPublicClient({
        chain: base,
        transport: http(),
    });
    const signer = toClientEvmSigner(account, publicClient);
    const client = new x402Client();
    registerExactEvmScheme(client, { signer });
    const paymentFetch = wrapFetchWithPayment(fetch, client);

    const headers: Record<string, string> = {
        Authorization: `Bearer ${JWT}`,
        "Content-Type": "application/json",
    };

    const endpoints: {
        name: string;
        url: string;
        method: string;
        body?: string;
    }[] = [
        {
            name: "GET secret (path: demo/x402)",
            method: "GET",
            url: `${BASE_URL}/v1/vaults/${VAULT_ID}/secrets/demo%2Fx402`,
        },
        {
            name: "PUT secret (path: demo/x402)",
            method: "PUT",
            url: `${BASE_URL}/v1/vaults/${VAULT_ID}/secrets/demo%2Fx402`,
            body: JSON.stringify({ value: "x402-demo-value", type: "generic" }),
        },
        {
            name: "GET audit/events",
            method: "GET",
            url: `${BASE_URL}/v1/audit/events`,
        },
    ];

    if (AGENT_ID) {
        endpoints.push({
            name: "POST agents/transactions/simulate",
            method: "POST",
            url: `${BASE_URL}/v1/agents/${AGENT_ID}/transactions/simulate`,
            body: JSON.stringify({
                chain: "base",
                to: "0x0000000000000000000000000000000000000000",
                value: "0",
                data: "0x",
            }),
        });
    }

    console.log(`Using wallet: ${account.address}`);
    console.log(`Base URL: ${BASE_URL}\n`);

    for (const ep of endpoints) {
        process.stdout.write(`  ${ep.name} ... `);
        try {
            const init: RequestInit = { method: ep.method, headers };
            if (ep.body && ep.method !== "GET")
                (init as Record<string, unknown>).body = ep.body;
            const res = await paymentFetch(ep.url, init);
            if (res.status === 402) {
                console.log(
                    "402 (payment required; ensure X402_PRIVATE_KEY wallet has USDC on Base to auto-pay)",
                );
            } else if (res.ok) {
                console.log(`${res.status} OK`);
            } else {
                console.log(`${res.status} ${(await res.text()).slice(0, 80)}`);
            }
        } catch (e) {
            console.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    console.log(
        "\nDone. If you saw 200 OK, you're within quota. Over quota → 402 then auto-pay with X402_PRIVATE_KEY.",
    );
}

main();
