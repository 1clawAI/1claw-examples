/**
 * x402 paywall server — charges $0.001 USDC on Base mainnet per request.
 *
 * Uses the Coinbase CDP facilitator for payment verification and settlement.
 * Requires CDP_API_KEY_ID and CDP_API_KEY_SECRET in .env.
 *
 * Run:  npm run server
 * Test: curl http://localhost:4021/joke  (returns 402 without payment)
 */

import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const PAY_TO = process.env.X402_PAY_TO_ADDRESS!;
const CDP_KEY_ID = process.env.CDP_API_KEY_ID!;
const CDP_KEY_SECRET = process.env.CDP_API_KEY_SECRET!;
const PORT = Number(process.env.X402_SERVER_PORT ?? 4021);

if (!PAY_TO) {
    console.error("Required: X402_PAY_TO_ADDRESS (receiving wallet for payments)");
    process.exit(1);
}
if (!CDP_KEY_ID || !CDP_KEY_SECRET) {
    console.error("Required: CDP_API_KEY_ID, CDP_API_KEY_SECRET");
    process.exit(1);
}

const CDP_HOST = "api.cdp.coinbase.com";

async function cdpAuthHeaders(method: string, path: string): Promise<Record<string, string>> {
    const jwt = await generateJwt({
        apiKeyId: CDP_KEY_ID,
        apiKeySecret: CDP_KEY_SECRET,
        requestMethod: method,
        requestHost: CDP_HOST,
        requestPath: path,
    });
    return { Authorization: `Bearer ${jwt}` };
}

const app = express();

const facilitator = new HTTPFacilitatorClient({
    url: `https://${CDP_HOST}/platform/v2/x402`,
    createAuthHeaders: async () => ({
        verify: await cdpAuthHeaders("POST", "/platform/v2/x402/verify"),
        settle: await cdpAuthHeaders("POST", "/platform/v2/x402/settle"),
        supported: await cdpAuthHeaders("GET", "/platform/v2/x402/supported"),
    }),
});

const server = new x402ResourceServer(facilitator).register(
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

app.listen(PORT, () => {
    console.log(`\nx402 paywall server running on http://localhost:${PORT}`);
    console.log(`Facilitator: Coinbase CDP`);
    console.log(`Pay-to:      ${PAY_TO}`);
    console.log(`\ncurl http://localhost:${PORT}/joke   → 402 (use x402 client to pay)\n`);
});
