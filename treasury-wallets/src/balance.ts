/**
 * Check balances on treasury wallets.
 *
 * Lists all active wallets and queries native balance for each.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const API_KEY = process.env.ONECLAW_API_KEY;

if (!API_KEY) {
    console.error("Set ONECLAW_API_KEY in .env (use a 1ck_ user API key)");
    process.exit(1);
}

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY!,
    });

    // List wallets
    const { data: listData, error: listError } = await client.treasuryWallets.listWallets();
    if (listError) {
        console.error("Failed to list wallets:", listError.message);
        process.exit(1);
    }

    if (!listData?.wallets.length) {
        console.log("No treasury wallets found. Run `npm run generate` first.");
        process.exit(0);
    }

    console.log("Treasury wallet balances:\n");

    for (const wallet of listData.wallets) {
        const { data: balanceData, error: balanceError } =
            await client.treasuryWallets.getWalletBalance(wallet.chain);

        if (balanceError) {
            console.log(`  ${wallet.chain.padEnd(10)} ${wallet.address}  (balance unavailable)`);
            continue;
        }

        console.log(
            `  ${wallet.chain.padEnd(10)} ${wallet.address}  ${balanceData!.native_balance} ${balanceData!.native_symbol}`,
        );

        if (balanceData!.tokens?.length) {
            for (const token of balanceData!.tokens) {
                console.log(`  ${"".padEnd(10)} ${token.symbol}: ${token.balance}`);
            }
        }
    }
}

main().catch(console.error);
