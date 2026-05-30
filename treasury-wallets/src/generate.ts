/**
 * Generate treasury wallets across all supported chains.
 *
 * Treasury wallets are human-only and require a Pro or higher plan.
 * Private keys are stored in the per-org __treasury-keys vault with MPC custody.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
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

    console.log("Generating treasury wallets for all supported chains...\n");

    const { data, error } = await client.treasuryWallets.generateWallets({});

    if (error) {
        console.error("Failed:", error.message);
        process.exit(1);
    }

    console.log(`Generated ${data!.wallets.length} wallet(s):\n`);
    for (const wallet of data!.wallets) {
        console.log(`  ${wallet.chain.padEnd(10)} ${wallet.address}`);
        console.log(`  ${"".padEnd(10)} curve: ${wallet.curve}, public_key: ${wallet.public_key_hex.slice(0, 20)}...`);
        console.log();
    }

    // List all wallets to confirm
    const listRes = await client.treasuryWallets.listWallets();
    if (listRes.data) {
        console.log(`Total active wallets: ${listRes.data.wallets.length}`);
    }
}

main().catch(console.error);
