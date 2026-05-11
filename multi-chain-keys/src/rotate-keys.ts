/**
 * 1Claw SDK — Multi-Chain Signing Keys: Rotate
 *
 * Rotates the signing key for a given chain. The old key is
 * deactivated and a new keypair is generated inside the HSM.
 *
 * Usage:
 *   npm run rotate              # defaults to "ethereum"
 *   npm run rotate -- solana    # rotate the Solana key
 *
 * Prerequisites:
 *   - ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID set in .env
 *   - Key must already be provisioned for the target chain
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

const chain = process.argv[2] ?? "ethereum";

function truncate(s: string, len: number): string {
    if (s.length <= len) return s;
    const half = Math.floor((len - 3) / 2);
    return s.slice(0, half) + "..." + s.slice(-half);
}

async function main() {
    console.log(`Multi-Chain Signing Keys — Rotate (${chain})\n`);

    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY,
        agentId: AGENT_ID,
    });

    // Snapshot before rotation
    console.log("--- Before ---");
    const beforeRes = await client.signingKeys.list(AGENT_ID!);
    if (beforeRes.error) {
        console.error("Failed to list keys:", beforeRes.error.message);
        process.exit(1);
    }

    const beforeKey = beforeRes.data!.keys?.find(
        (k) => k.chain === chain && k.is_active,
    );
    if (!beforeKey) {
        console.error(
            `No active key found for chain "${chain}". Run \`npm run provision\` first.`,
        );
        process.exit(1);
    }

    console.log(`  Chain:      ${beforeKey.chain}`);
    console.log(`  Curve:      ${beforeKey.curve}`);
    console.log(`  Public Key: ${truncate(beforeKey.public_key, 40)}`);
    console.log(`  Address:    ${beforeKey.address ?? "-"}`);
    console.log(`  Version:    ${beforeKey.key_version ?? 1}`);

    // Rotate
    console.log(`\nRotating ${chain} key...`);
    const rotateRes = await client.signingKeys.rotate(AGENT_ID!, chain);

    if (rotateRes.error) {
        console.error("Rotation failed:", rotateRes.error.message);
        process.exit(1);
    }

    const newKey = rotateRes.data!;
    console.log("Rotation complete.\n");

    // Snapshot after rotation
    console.log("--- After ---");
    console.log(`  Chain:      ${newKey.chain}`);
    console.log(`  Curve:      ${newKey.curve}`);
    console.log(`  Public Key: ${truncate(newKey.public_key, 40)}`);
    console.log(`  Address:    ${newKey.address ?? "-"}`);
    console.log(`  Version:    ${newKey.key_version ?? "n/a"}`);

    console.log("\n--- Diff ---");
    console.log(`  Address:    ${beforeKey.address ?? "-"} → ${newKey.address ?? "-"}`);
    console.log(
        `  Public Key: ${truncate(beforeKey.public_key, 20)} → ${truncate(newKey.public_key, 20)}`,
    );

    console.log("\nDone!");
}

main().catch(console.error);
