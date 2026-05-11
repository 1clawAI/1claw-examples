/**
 * EIP-712 typed structured data signing — sign a USDC Permit.
 *
 * Requires `eip712_domain_allowlist` to include the verifyingContract,
 * or `eip712_default_policy` set to "allow" on the agent.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!API_KEY || !AGENT_ID) {
    console.error("Set ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID in .env");
    process.exit(1);
}

const typedData = {
    types: {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    },
    primaryType: "Permit",
    domain: {
        name: "USD Coin",
        version: "2",
        chainId: 1,
        verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
    message: {
        owner: "0x1234567890abcdef1234567890abcdef12345678",
        spender: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        value: "1000000",
        nonce: "0",
        deadline: "1735689600",
    },
};

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
        agentId: AGENT_ID,
    });

    console.log("Signing EIP-712 typed data (USDC Permit)...\n");

    const { data, error } = await client.agents.sign(AGENT_ID!, {
        intent_type: "typed_data",
        chain: "ethereum",
        typed_data: typedData,
    });

    if (error) {
        console.error("Sign failed:", error.message);
        if (error.message?.includes("domain")) {
            console.error(
                "\nHint: Add the verifyingContract to eip712_domain_allowlist:\n" +
                    '  [{ "verifying_contract": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }]',
            );
        }
        process.exit(1);
    }

    console.log("Signature:      ", data.signature);
    console.log("Typed data hash:", data.typed_data_hash);
    console.log("From:           ", data.from);
    console.log(
        "\nThe EIP-712 domain separator and struct hash were computed server-side.",
    );
}

main().catch(console.error);
