/**
 * x402 paywall server — charges $0.001 USDC on Base mainnet per request.
 *
 * Uses a local facilitator that supports both EOA and smart-account
 * (ERC-6492) signatures. The facilitator wallet needs Base ETH for gas
 * to settle `transferWithAuthorization` on-chain.
 *
 * Run:  npm run server
 * Test: curl http://localhost:4021/joke  (returns 402 without payment)
 */

import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactEvmScheme as ExactEvmFacilitatorScheme } from "@x402/evm/exact/facilitator";
import { x402Facilitator } from "@x402/core/facilitator";
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { resolveBuyerKey } from "./resolve-buyer-key.js";

const PAY_TO = process.env.X402_PAY_TO_ADDRESS!;
const PORT = Number(process.env.X402_SERVER_PORT ?? 4021);

const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!PAY_TO) {
    console.error("Required: X402_PAY_TO_ADDRESS (receiving wallet for payments)");
    process.exit(1);
}

const buyerKeyPath = process.env.BUYER_KEY_PATH?.trim() || "keys/x402-session-key";
const baseRpcUrl = process.env.BASE_RPC_URL?.trim();
const baseTransport = baseRpcUrl ? http(baseRpcUrl) : http();

let facilitatorKey = process.env.X402_FACILITATOR_KEY as `0x${string}` | undefined;
if (!facilitatorKey && API_KEY && VAULT_ID) {
    facilitatorKey = (await resolveBuyerKey({
        apiKey: API_KEY,
        vaultId: VAULT_ID,
        baseUrl: BASE_URL,
        agentId: AGENT_ID,
        secretPath: buyerKeyPath,
    })) as `0x${string}`;
    console.log("[server] Facilitator key fetched from 1Claw vault");
}

if (!facilitatorKey) {
    console.error("Required: X402_FACILITATOR_KEY or ONECLAW_API_KEY + ONECLAW_VAULT_ID");
    process.exit(1);
}

const facilitatorAccount = privateKeyToAccount(facilitatorKey);
const walletClient = createWalletClient({
    account: facilitatorAccount,
    chain: base,
    transport: baseTransport,
});

const publicClient = createPublicClient({
    chain: base,
    transport: baseTransport,
});

const evmSigner = {
    ...publicClient,
    ...walletClient,
    address: facilitatorAccount.address,
    getAddresses: () => [facilitatorAccount.address],
};

const facilitator = new x402Facilitator();
facilitator.register(
    "eip155:8453",
    new ExactEvmFacilitatorScheme(
        evmSigner as any,
        { deployERC4337WithEIP6492: true },
    ),
);

const app = express();

const server = new x402ResourceServer(facilitator as any).register(
    "eip155:8453",
    new ExactEvmScheme(),
);

const routes = {
    "GET /joke": {
        accepts: [
            {
                scheme: "exact" as const,
                price: "$0.001",
                network: "eip155:8453" as const,
                payTo: PAY_TO,
            },
        ],
        description: "Get a random joke ($0.001 USDC on Base)",
        mimeType: "application/json",
    },
};

app.use(paymentMiddleware(routes, server));

const jokes = [
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "A SQL query walks into a bar, sees two tables, and asks… 'Can I JOIN you?'",
    "There are only 10 kinds of people: those who understand binary and those who don't.",
    "Why did the blockchain developer break up? Too many trust issues.",
    "What's a crypto wallet's favorite type of music? Heavy metal keys.",
];

app.get("/joke", (_req, res) => {
    res.json({
        joke: jokes[Math.floor(Math.random() * jokes.length)],
        price: "$0.001 USDC on Base",
        paid: true,
    });
});

app.get("/", (_req, res) => {
    res.json({
        service: "x402 paywall demo",
        endpoints: { "/joke": "$0.001 USDC on Base mainnet" },
    });
});

try {
    const wei = await publicClient.getBalance({ address: facilitatorAccount.address });
    if (wei === 0n) {
        console.warn(
            `\n⚠  Facilitator ${facilitatorAccount.address} has 0 ETH on Base.\n` +
            `   Settlement will fail with "invalid_exact_evm_transaction_failed"\n` +
            `   and an empty transaction hash.\n` +
            `   → Fund this EOA with Base ETH for gas.\n` +
            `   Note: USDC on the payer smart account does NOT pay facilitator gas.\n`,
        );
    } else if (wei < 20_000_000_000_000_000n) {
        console.warn(
            `\n⚠  Facilitator ${facilitatorAccount.address} has only ${formatEther(wei)} ETH on Base — may be too low for gas.\n`,
        );
    }
} catch (err) {
    console.warn(
        `\n⚠  Could not read facilitator ETH balance (RPC error): ${err instanceof Error ? err.message : err}\n`,
    );
}

app.listen(PORT, () => {
    console.log(`\nx402 paywall server running on http://localhost:${PORT}`);
    console.log(`Facilitator: Local (${facilitatorAccount.address})`);
    console.log(`Pay-to:      ${PAY_TO}`);
    console.log(`\ncurl http://localhost:${PORT}/joke   → 402 (use x402 client to pay)\n`);
});
