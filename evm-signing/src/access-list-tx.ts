/**
 * Type 1 — EIP-2930 access list transaction signing on Sepolia.
 *
 * Pre-declares storage slots the transaction will access,
 * reducing gas cost on the accessed slots.
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

const accessList = [
    {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        storage_keys: [
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000000000000000000000000001",
        ],
    },
];

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
        agentId: AGENT_ID,
    });

    console.log(
        "Signing a Type 1 EIP-2930 access list transaction on Sepolia...\n",
    );

    const { data, error } = await client.agents.sign(AGENT_ID!, {
        intent_type: "transaction",
        chain: "sepolia",
        tx_type: 1,
        to: TO_ADDRESS,
        value: "0",
        gas_price: "20000000000",
        gas_limit: 30000,
        data: "0x",
        access_list: accessList,
    } as any);

    if (error) {
        console.error("Sign failed:", error.message);
        process.exit(1);
    }

    console.log("Signed tx:", data!.signed_tx);
    console.log("Tx hash:  ", data!.tx_hash);
    console.log("From:     ", data!.from);
    console.log("Tx type:  ", data!.tx_type, "(EIP-2930 access list)");
    console.log(
        "\nAccess list pre-warms storage slots for cheaper SLOAD/SSTORE.",
    );
}

main().catch(console.error);
