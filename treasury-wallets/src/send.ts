/**
 * Send native currency from an Ethereum treasury wallet.
 *
 * Requires re-authentication via account password. The transaction is
 * signed server-side and broadcast via RPC. Audit-logged.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
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

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
    });

    console.log(`Sending ${SEND_AMOUNT} ETH to ${SEND_TO}...\n`);

    const { data, error } = await client.treasuryWallets.sendFromWallet(
        "ethereum",
        {
            to: SEND_TO!,
            amount: SEND_AMOUNT,
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
    console.log(`  Amount:  ${data!.amount}`);
    console.log(`  Chain:   ${data!.chain}`);
}

main().catch(console.error);
