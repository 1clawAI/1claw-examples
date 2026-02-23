/**
 * 1Claw + Ampersend — MCP Client with x402 Payments
 *
 * Uses the Ampersend SDK Client with a NaiveTreasurer and Streamable HTTP
 * transport. The buyer key can come from either:
 *   - BUYER_PRIVATE_KEY env var (traditional)
 *   - Fetched from a 1Claw vault at BUYER_KEY_PATH (default: "keys/x402-session-key")
 */

import {
    AccountWallet,
    Client,
    type Authorization,
    type PaymentContext,
    type PaymentStatus,
    type X402Treasurer,
} from "@ampersend_ai/ampersend-sdk";
import type { PaymentRequirements } from "x402/types";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { resolveBuyerKey } from "./resolve-buyer-key.js";

const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_TOKEN = process.env.ONECLAW_AGENT_TOKEN;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const MCP_URL = "https://mcp.1claw.xyz/mcp";

if (!API_KEY || !AGENT_TOKEN || !VAULT_ID) {
    console.error(
        "Required: ONECLAW_API_KEY, ONECLAW_AGENT_TOKEN, ONECLAW_VAULT_ID",
    );
    process.exit(1);
}

console.log("=== 1Claw + Ampersend MCP Client ===\n");

const PRIVATE_KEY = await resolveBuyerKey({
    apiKey: API_KEY,
    vaultId: VAULT_ID,
    baseUrl: BASE_URL,
    agentId: process.env.ONECLAW_AGENT_ID,
});

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

console.log("Connecting to 1Claw MCP server with x402 payment support...");

const wallet = AccountWallet.fromPrivateKey(PRIVATE_KEY);
const treasurer = new NaiveTreasurer(wallet);

const client = new Client(
    { name: "1claw-ampersend-x402", version: "0.1.0" },
    {
        mcpOptions: { capabilities: { tools: {} } },
        treasurer,
    },
);

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
        headers: {
            Authorization: `Bearer ${AGENT_TOKEN}`,
            "X-Vault-ID": VAULT_ID,
        },
    },
});

await client.connect(transport);

console.log("\n1. Listing available tools...");
const toolsResult = await client.listTools();
console.log(
    `   Found ${toolsResult.tools.length} tools:`,
    toolsResult.tools.map((t) => t.name).join(", "),
);

console.log("\n2. Listing secrets (may require payment if over quota)...");
const listResult = await client.callTool({
    name: "list_secrets",
    arguments: { vault_id: VAULT_ID },
});
console.log("   Result:", JSON.stringify(listResult, null, 2));

console.log("\n3. Reading a secret...");
try {
    const getResult = await client.callTool({
        name: "get_secret",
        arguments: { vault_id: VAULT_ID, path: "test/demo" },
    });
    console.log("   Result:", JSON.stringify(getResult, null, 2));
} catch (err) {
    console.log(
        "   Expected if no secret at 'test/demo':",
        err instanceof Error ? err.message : err,
    );
}

console.log("\n4. Writing a secret...");
const putResult = await client.callTool({
    name: "put_secret",
    arguments: {
        vault_id: VAULT_ID,
        path: "test/ampersend-demo",
        value: `created-at-${Date.now()}`,
        type: "note",
    },
});
console.log("   Result:", JSON.stringify(putResult, null, 2));

await client.close();
console.log("\nDone. If any calls exceeded your quota, the client handled the");
console.log("x402 payment automatically using your session key wallet.");
