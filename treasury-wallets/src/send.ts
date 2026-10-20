/**
 * Send native currency from an Ethereum treasury wallet.
 *
 * Requires re-authentication via account password. The transaction is
 * signed server-side and broadcast via RPC. Audit-logged.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const API_KEY = process.env.ONECLAW_API_KEY;
const SEND_TO = process.env.SEND_TO;
const SEND_AMOUNT = process.env.SEND_AMOUNT ?? "0.001";
const SEND_PASSWORD = process.env.SEND_PASSWORD;

if (!API_KEY) {
    console.error("Set ONECLAW_API_KEY in .env (use a 1ck_ user API key)");
    process.exit(1);
}
if (!SEND_TO) {
    console.error("Set SEND_TO in .env (recipient address)");
    process.exit(1);
}
if (!SEND_PASSWORD) {
    console.error("Set SEND_PASSWORD in .env (account password for re-auth)");
    process.exit(1);
}

/** "0.001" ETH -> "1000000000000000" wei, without floating point. */
function ethToWei(eth: string): string {
    const [whole, frac = ""] = eth.trim().split(".");
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || frac.length > 18) {
        throw new Error(`SEND_AMOUNT must be a decimal ETH amount, got ${eth}`);
    }
    return (BigInt(whole || "0") * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18))).toString();
}

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
    });

    console.log(`Sending ${SEND_AMOUNT} ETH to ${SEND_TO}...\n`);

    // The API takes the amount in wei, as a decimal string.
    const { data, error } = await client.treasuryWallets.sendFromWallet(
        "ethereum",
        {
            to: SEND_TO!,
            value_wei: ethToWei(SEND_AMOUNT),
        },
        SEND_PASSWORD!,
    );

    if (error) {
        console.error("Send failed:", error.message);
        process.exit(1);
    }

    console.log("Transaction sent successfully!");
    console.log(`  Tx Hash: ${data!.tx_hash}`);
    console.log(`  From:    ${data!.from}`);
    console.log(`  To:      ${data!.to}`);
    console.log(`  Value:   ${data!.value_wei} wei`);
    console.log(`  Chain:   ${data!.chain}`);
}

main().catch(console.error);
