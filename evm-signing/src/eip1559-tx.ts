/**
 * Type 2 — EIP-1559 transaction signing on Base Sepolia.
 *
 * Uses maxFeePerGas and maxPriorityFeePerGas instead of gasPrice.
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

    console.log("Signing a Type 2 EIP-1559 transaction on Base Sepolia...\n");

    const { data, error } = await client.agents.sign(AGENT_ID!, {
        intent_type: "transaction",
        chain: "base-sepolia",
        tx_type: 2,
        to: TO_ADDRESS,
        value: "0",
        max_fee_per_gas: "1500000000",
        max_priority_fee_per_gas: "1000000000",
        gas_limit: 21000,
    });

    if (error) {
        console.error("Sign failed:", error.message);
        process.exit(1);
    }

    console.log("Signed tx:", data!.signed_tx);
    console.log("Tx hash:  ", data!.tx_hash);
    console.log("From:     ", data!.from);
    console.log("Tx type:  ", data!.tx_type, "(EIP-1559)");
}

main().catch(console.error);
