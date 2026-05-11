/**
 * 1Claw SDK — Bitcoin Signing Key
 *
 * Provisions an HSM-backed secp256k1 key and derives a P2WPKH (native SegWit)
 * Bitcoin address. The private key never leaves the HSM boundary.
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!AGENT_API_KEY || !AGENT_ID) {
    console.error(
        "Set ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID in your .env file",
    );
    process.exit(1);
}

async function main() {
    console.log("Bitcoin Signing Key\n");

    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY,
        agentId: AGENT_ID,
    });

    let chain = "bitcoin";
    let curve: string;
    let publicKey: string;
    let address: string;

    const res = await client.signingKeys.create(AGENT_ID!, { chain });

    if (res.error) {
        const msg = res.error.message ?? res.error.detail ?? "";
        if (msg.includes("already") || msg.includes("409")) {
            console.log("  Key already provisioned — fetching existing key\n");
            const listRes = await client.signingKeys.list(AGENT_ID!);
            if (listRes.error) {
                console.error("Failed to list keys:", listRes.error.message);
                process.exit(1);
            }
            const existing = listRes.data!.keys?.find(
                (k) => k.chain === chain && k.is_active,
            );
            if (!existing) {
                console.error("No active bitcoin key found");
                process.exit(1);
            }
            curve = existing.curve;
            publicKey = existing.public_key;
            address = existing.address ?? "-";
        } else {
            console.error("Failed to provision key:", msg);
            process.exit(1);
        }
    } else {
        const key = res.data!;
        curve = key.curve;
        publicKey = key.public_key;
        address = key.address ?? "-";
        console.log("  Key provisioned successfully\n");
    }

    console.log("--- Key Details ---\n");
    console.log(`  Chain:      ${chain}`);
    console.log(`  Curve:      ${curve!}`);
    console.log(`  Public Key: ${publicKey!}`);
    console.log(`  Address:    ${address!}`);

    console.log("\n--- Bitcoin Address Info ---\n");
    console.log("  Format:   P2WPKH native SegWit (bech32, starts with bc1q)");
    console.log(`  Explorer: https://mempool.space/address/${address!}`);

    console.log("\n--- Next Steps ---\n");
    console.log(
        "  Coming soon: on-chain transaction signing for Bitcoin",
    );
    console.log(
        "  Bitcoin signing support (PSBT, legacy P2PKH) is on the roadmap",
    );
}

main().catch(console.error);
