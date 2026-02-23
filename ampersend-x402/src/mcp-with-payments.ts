/**
 * 1Claw + Ampersend — MCP client with x402 payments.
 *
 * Connects to the 1Claw MCP server over Streamable HTTP transport.
 * The buyer key can come from BUYER_PRIVATE_KEY env or from a 1Claw vault.
 * The MCP auth token is obtained automatically from ONECLAW_API_KEY +
 * ONECLAW_AGENT_ID (no pre-baked JWT needed).
 */

import {
    SmartAccountWallet,
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
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const SMART_ACCOUNT = process.env.SMART_ACCOUNT_ADDRESS;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const MCP_URL = "https://mcp.1claw.xyz/mcp";

if (!API_KEY || !AGENT_ID || !VAULT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_AGENT_ID, ONECLAW_VAULT_ID");
    process.exit(1);
}

console.log("=== 1Claw + Ampersend MCP Client ===\n");

console.log("[auth] Fetching agent JWT...");
const tokenRes = await fetch(`${BASE_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: API_KEY, agent_id: AGENT_ID }),
});
if (!tokenRes.ok) {
    console.error(`[auth] Failed (${tokenRes.status}): ${await tokenRes.text()}`);
    process.exit(1);
}
const { access_token: AGENT_TOKEN } = (await tokenRes.json()) as { access_token: string };
console.log("[auth] Agent JWT obtained");

const PRIVATE_KEY = await resolveBuyerKey({
    apiKey: API_KEY,
    vaultId: VAULT_ID,
    baseUrl: BASE_URL,
    agentId: AGENT_ID,
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

const wallet = SMART_ACCOUNT
    ? new SmartAccountWallet({
          smartAccountAddress: SMART_ACCOUNT as `0x${string}`,
          sessionKeyPrivateKey: PRIVATE_KEY,
          chainId: 8453,
      })
    : AccountWallet.fromPrivateKey(PRIVATE_KEY);
const treasurer = new NaiveTreasurer(wallet);

console.log("Connecting to 1Claw MCP server...");

const client = new Client(
    { name: "1claw-ampersend-x402", version: "0.1.0" },
    { mcpOptions: { capabilities: { tools: {} } }, treasurer },
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
console.log(`   Found ${toolsResult.tools.length} tools:`, toolsResult.tools.map((t) => t.name).join(", "));

console.log("\n2. Listing secrets (may trigger x402 if over quota)...");
const listResult = await client.callTool({
    name: "list_secrets",
    arguments: { vault_id: VAULT_ID },
});
console.log("   Result:", JSON.stringify(listResult, null, 2));

console.log("\n3. Writing a test secret...");
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
console.log("\nDone.");
