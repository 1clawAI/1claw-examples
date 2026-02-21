/**
 * 1Claw + Ampersend — MCP Client with x402 Payments
 *
 * Wraps the 1Claw MCP server with Ampersend's x402 payment layer.
 * When a tool call returns 402, the Ampersend client automatically:
 *   1. Reads the payment requirements from the 402 response
 *   2. Has the Treasurer authorize the payment
 *   3. Signs the payment with the Wallet
 *   4. Retries the request with the payment proof
 *
 * This is the simplest way to add x402 payments — one function call.
 */

import { createAmpersendMcpClient } from "@ampersend_ai/ampersend-sdk";

const PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const AGENT_TOKEN = process.env.ONECLAW_AGENT_TOKEN;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;

if (!PRIVATE_KEY || !AGENT_TOKEN || !VAULT_ID) {
    console.error(
        "Required: BUYER_PRIVATE_KEY, ONECLAW_AGENT_TOKEN, ONECLAW_VAULT_ID",
    );
    process.exit(1);
}

console.log("=== 1Claw + Ampersend MCP Client ===\n");
console.log("Connecting to 1Claw MCP server with x402 payment support...");

const client = await createAmpersendMcpClient({
    sessionKeyPrivateKey: PRIVATE_KEY as `0x${string}`,
    serverUrl: "https://mcp.1claw.xyz/mcp",
    headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        "X-Vault-ID": VAULT_ID,
    },
});

// ── List available tools ────────────────────────────────────────────

console.log("\n1. Listing available tools...");
const tools = await client.listTools();
console.log(
    `   Found ${tools.tools.length} tools:`,
    tools.tools.map((t) => t.name).join(", "),
);

// ── Call a tool (may trigger x402 payment) ──────────────────────────

console.log("\n2. Listing secrets (may require payment if over quota)...");
const listResult = await client.callTool("list_secrets", {
    vault_id: VAULT_ID,
});
console.log("   Result:", JSON.stringify(listResult.content, null, 2));

// ── Read a specific secret ──────────────────────────────────────────

console.log("\n3. Reading a secret (higher chance of 402 on free tier)...");
try {
    const getResult = await client.callTool("get_secret", {
        vault_id: VAULT_ID,
        path: "test/demo",
    });
    console.log("   Result:", JSON.stringify(getResult.content, null, 2));
} catch (err) {
    console.log(
        "   Expected if no secret at 'test/demo':",
        err instanceof Error ? err.message : err,
    );
}

// ── Write a secret (will definitely count against quota) ────────────

console.log("\n4. Writing a secret...");
const putResult = await client.callTool("put_secret", {
    vault_id: VAULT_ID,
    path: "test/ampersend-demo",
    value: `created-at-${Date.now()}`,
    type: "note",
});
console.log("   Result:", JSON.stringify(putResult.content, null, 2));

// ── Clean up ────────────────────────────────────────────────────────

await client.close();
console.log("\nDone. If any calls exceeded your quota, Ampersend handled the");
console.log("x402 payment automatically using your session key wallet.");
