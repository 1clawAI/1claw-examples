/**
 * Type 0 — Legacy (EIP-155) transaction signing on Sepolia.
 *
 * Signs a minimal 0-value transaction to demonstrate the flow.
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

    console.log("Signing a Type 0 legacy transaction on Sepolia...\n");

    const { data, error } = await client.agents.sign(AGENT_ID!, {
        intent_type: "transaction",
        chain: "sepolia",
        tx_type: 0,
        to: TO_ADDRESS,
        value: "0",
        gas_price: "20000000000",
        gas_limit: 21000,
        data: "0x",
    });

    if (error) {
        console.error("Sign failed:", error.message);
        process.exit(1);
    }

    console.log("Signed tx:", data.signed_tx);
    console.log("Tx hash:  ", data.tx_hash);
    console.log("From:     ", data.from);
    console.log("Tx type:  ", data.tx_type, "(legacy EIP-155)");
}

main().catch(console.error);
