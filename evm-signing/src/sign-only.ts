/**
 * Sign-only mode — signs a transaction without broadcasting.
 *
 * Use this when you want to broadcast through your own RPC or inspect
 * the raw transaction before submitting it on-chain.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const TO_ADDRESS =
    process.env.TO_ADDRESS ?? "0x0000000000000000000000000000000000000001";

if (!API_KEY || !AGENT_ID) {
    console.error("Set ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID in .env");
    process.exit(1);
}

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
        agentId: AGENT_ID,
    });

    console.log("Signing a transaction (sign-only, no broadcast)...\n");

    const { data, error } = await client.agents.sign(AGENT_ID!, {
        intent_type: "transaction",
        chain: "ethereum",
        tx_type: 2,
        to: TO_ADDRESS,
        value: "0",
        max_fee_per_gas: "30000000000",
        max_priority_fee_per_gas: "2000000000",
        gas_limit: 21000,
    });

    if (error) {
        console.error("Sign failed:", error.message);
        process.exit(1);
    }

    console.log("Signed tx (hex):", data.signed_tx);
    console.log("Tx hash:        ", data.tx_hash);
    console.log("From:           ", data.from);
    console.log("\n--- What to do next ---");
    console.log(
        "Broadcast this signed transaction via your own RPC provider:",
    );
    console.log(
        '  curl -X POST https://eth.llamarpc.com -H "Content-Type: application/json" \\',
    );
    console.log(
        `    -d '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["${data.signed_tx}"],"id":1}'`,
    );
}

main().catch(console.error);
