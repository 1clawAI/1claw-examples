/**
 * ERC-20 Token Transfer — server-side calldata via token_mint
 *
 * Demonstrates sending ERC-20 tokens (e.g. USDC) through the Intents API.
 * When `token_mint` and `token_decimals` are provided, the server builds
 * the ERC-20 `transfer()` calldata automatically — no ABI encoding needed
 * on the client side.
 *
 * Usage:
 *   npm run token-transfer
 *
 * Env:
 *   ONECLAW_AGENT_API_KEY, ONECLAW_AGENT_ID
 *   TO_ADDRESS (optional, defaults to burn address)
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const TO_ADDRESS =
    process.env.TO_ADDRESS ?? "0x0000000000000000000000000000000000000001";

if (!API_KEY || !AGENT_ID) {
    console.error("Set ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID in .env");
    process.exit(1);
}

const USDC_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
        agentId: AGENT_ID,
    });

    // --- ERC-20 transfer via token_mint (server builds calldata) ---
    console.log("Submitting ERC-20 token transfer (USDC on Ethereum)...\n");

    const { data, error } = await client.agents.submitTransaction(AGENT_ID!, {
        to: USDC_MAINNET,
        value: "100",
        chain: "ethereum",
        token_mint: USDC_MAINNET,
        token_decimals: 6,
    });

    if (error) {
        console.error("Token transfer failed:", error.message);
        process.exit(1);
    }

    console.log("Status:    ", data!.status);
    console.log("Tx hash:   ", data!.tx_hash ?? "n/a");
    if (data!.signed_tx) {
        console.log("Signed tx: ", data!.signed_tx.slice(0, 30) + "...");
    }

    // --- Sign-only mode (no broadcast) ---
    console.log("\n\nSigning ERC-20 transfer without broadcasting...\n");

    const signRes = await client.agents.signTransaction(AGENT_ID!, {
        to: USDC_MAINNET,
        value: "50",
        chain: "ethereum",
        token_mint: USDC_MAINNET,
        token_decimals: 6,
    });

    if (signRes.error) {
        console.error("Sign-only failed:", signRes.error.message);
        process.exit(1);
    }

    const signData = signRes.data as {
        tx_hash?: string;
        from?: string;
        status?: string;
        signed_tx?: string;
    };

    console.log("Status:    ", signData.status ?? "sign_only");
    console.log("Tx hash:   ", signData.tx_hash ?? "n/a");
    console.log("From:      ", signData.from ?? "n/a");
    console.log(
        "\nBroadcast the signed_tx with your own RPC when ready.",
    );
}

main().catch(console.error);
