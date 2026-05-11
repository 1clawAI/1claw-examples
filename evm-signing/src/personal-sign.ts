/**
 * EIP-191 personal_sign — sign an arbitrary message with the agent's key.
 *
 * Requires `message_signing_enabled: true` on the agent record.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!API_KEY) {
    console.error("Set ONECLAW_AGENT_API_KEY in .env");
    process.exit(1);
}

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
        agentId: AGENT_ID,
    });

    console.log("Signing an EIP-191 personal message...\n");

    const { data, error } = await client.agents.sign(AGENT_ID!, {
        intent_type: "personal_sign",
        chain: "ethereum",
        message:
            "Hello from 1Claw! This message proves agent control of the signing key.",
    });

    if (error) {
        console.error("Sign failed:", error.message);
        if (error.message?.includes("message_signing_enabled")) {
            console.error(
                "\nHint: Enable message signing on your agent via the dashboard " +
                    "or SDK: client.agents.update(agentId, { message_signing_enabled: true })",
            );
        }
        process.exit(1);
    }

    console.log("Signature: ", data.signature);
    console.log("From:      ", data.from);
    console.log("Msg hash:  ", data.message_hash);
    console.log(
        "\nThe \\x19Ethereum Signed Message prefix was applied server-side.",
    );
}

main().catch(console.error);
