/**
 * x402 client — pays USDC on Base to access a paid endpoint.
 *
 * Uses `createAmpersendHttpClient` from the Ampersend SDK, which handles
 * smart-account signing through Ampersend's API (no manual EIP-1271 needed).
 *
 * Session key: BUYER_PRIVATE_KEY env var, or fetched from 1Claw vault.
 *
 * Targets:
 *   - Ampersend hosted:  https://services.ampersend.ai/api/joke  (default)
 *   - Local server:      http://localhost:4021/joke  (set X402_SERVER_URL)
 *
 * Debug: X402_CLIENT_DEBUG=1 npm run client
 *
 * Run:  npm run client
 */

import { createAmpersendHttpClient } from "@ampersend_ai/ampersend-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import {
    isX402ClientDebugEnabled,
    wrapX402DebugFetch,
} from "./debug-x402-fetch.js";
import { resolveBuyerKey } from "./resolve-buyer-key.js";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const erc20BalanceAbi = [
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
    },
] as const;

const SMART_ACCOUNT = process.env.SMART_ACCOUNT_ADDRESS as `0x${string}`;
const AMPERSEND_JOKE_URL = "https://services.ampersend.ai/api/joke";
const SERVER_URL = process.env.X402_SERVER_URL ?? AMPERSEND_JOKE_URL;

if (!SMART_ACCOUNT) {
    console.error("Required: SMART_ACCOUNT_ADDRESS");
    process.exit(1);
}

const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!API_KEY || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_VAULT_ID");
    process.exit(1);
}

const SESSION_KEY = (await resolveBuyerKey({
    apiKey: API_KEY,
    vaultId: VAULT_ID,
    baseUrl: BASE_URL,
    agentId: AGENT_ID,
})) as `0x${string}`;

const sessionKeyAccount = privateKeyToAccount(SESSION_KEY);

const ampersendClient = createAmpersendHttpClient({
    smartAccountAddress: SMART_ACCOUNT,
    sessionKeyPrivateKey: SESSION_KEY,
    apiUrl: process.env.AMPERSEND_API_URL?.trim() || "https://api.ampersend.ai",
    network: "base",
});

const baseFetch = wrapX402DebugFetch(fetch);
const paymentFetch = wrapFetchWithPayment(baseFetch, ampersendClient);

const baseRpcUrl = process.env.BASE_RPC_URL?.trim();
const publicClient = createPublicClient({
    chain: base,
    transport: baseRpcUrl ? http(baseRpcUrl) : http(),
});

if (isX402ClientDebugEnabled()) {
    console.log(
        "[x402 debug] X402_CLIENT_DEBUG=1 — logging fetch traffic.\n",
    );
}
console.log("=== x402 Client (Ampersend + 1Claw) ===\n");
console.log(`Smart account: ${SMART_ACCOUNT}`);
console.log(`Session key:   ${sessionKeyAccount.address}`);
console.log(`Server:        ${SERVER_URL}`);
console.log(
    `Ampersend API: ${process.env.AMPERSEND_API_URL?.trim() || "https://api.ampersend.ai"}`,
);

let usdcBalance = 0n;
try {
    usdcBalance = await publicClient.readContract({
        address: USDC_BASE,
        abi: erc20BalanceAbi,
        functionName: "balanceOf",
        args: [SMART_ACCOUNT],
    });
} catch (err) {
    console.warn(
        `(Could not read USDC balance: ${err instanceof Error ? err.message : err})`,
    );
    console.warn("  Set BASE_RPC_URL if the default public RPC is unreachable.");
}
const usdcHuman = formatUnits(usdcBalance, 6);
console.log(`\nUSDC on Base: ${usdcHuman} USDC`);

if (usdcBalance < 1_000n) {
    console.warn(
        "\nThis demo needs >= 0.001 USDC in the smart account.\n",
    );
}

console.log(`\nRequesting ${SERVER_URL} ...\n`);

let res: Response;
try {
    res = await paymentFetch(SERVER_URL);
} catch (e) {
    console.error(
        "\nPayment fetch threw:",
        e instanceof Error ? e.message : e,
    );
    process.exit(1);
}

console.log(`Status: ${res.status}`);

if (res.ok) {
    const data = await res.json();
    console.log(`\nResponse:`, JSON.stringify(data, null, 2));
    console.log("\nPayment successful!");
    process.exit(0);
}

const text = await res.text();
const detail = text?.trim() ? text : "(empty body)";
console.log(`\nError (${res.status}): ${detail}`);
process.exit(1);
