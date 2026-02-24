/**
 * Bootstrap ECDH demo keys into two 1Claw vaults (two accounts).
 * Generates ECDH + ECDSA key pairs for Alice and Bob, then stores
 * each agent's private keys in their respective vault.
 *
 * Requires two vaults (or two accounts). Set:
 *   ONECLAW_ALICE_VAULT_ID, ONECLAW_ALICE_API_KEY
 *   ONECLAW_BOB_VAULT_ID,   ONECLAW_BOB_API_KEY
 * Optional: ONECLAW_BASE_URL
 */

import { createClient } from "@1claw/sdk";
import {
    generateAgentKeys,
    exportEcdhPrivateBase64,
    exportSignPrivateKeyToBase64,
} from "../src/ecdh-crypto.js";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const ALICE_VAULT_ID = process.env.ONECLAW_ALICE_VAULT_ID;
const ALICE_API_KEY = process.env.ONECLAW_ALICE_API_KEY;
const BOB_VAULT_ID = process.env.ONECLAW_BOB_VAULT_ID;
const BOB_API_KEY = process.env.ONECLAW_BOB_API_KEY;

const ECDH_PATH = "keys/ecdh";
const SIGNING_PATH = "keys/signing";

async function main() {
    if (!ALICE_VAULT_ID || !ALICE_API_KEY || !BOB_VAULT_ID || !BOB_API_KEY) {
        console.error(
            "Set all four env vars: ONECLAW_ALICE_VAULT_ID, ONECLAW_ALICE_API_KEY,",
            "ONECLAW_BOB_VAULT_ID, ONECLAW_BOB_API_KEY",
        );
        process.exit(1);
    }

    const aliceClient = createClient({ baseUrl: BASE_URL, apiKey: ALICE_API_KEY });
    const bobClient = createClient({ baseUrl: BASE_URL, apiKey: BOB_API_KEY });

    console.log("Generating key pairs for Alice and Bob...");
    const aliceKeys = generateAgentKeys();
    const bobKeys = generateAgentKeys();

    console.log("Storing Alice's keys in her vault...");
    const aliceEcdhRes = await aliceClient.secrets.set(
        ALICE_VAULT_ID,
        ECDH_PATH,
        exportEcdhPrivateBase64(aliceKeys.ecdhPrivate),
        { type: "generic", metadata: { purpose: "ecdh-demo" } },
    );
    const aliceSignRes = await aliceClient.secrets.set(
        ALICE_VAULT_ID,
        SIGNING_PATH,
        exportSignPrivateKeyToBase64(aliceKeys.signPrivateKey),
        { type: "generic", metadata: { purpose: "ecdh-demo" } },
    );
    if (aliceEcdhRes.error || aliceSignRes.error) {
        console.error("Alice vault:", aliceEcdhRes.error?.message ?? aliceSignRes.error?.message);
        process.exit(1);
    }
    console.log(`  ${ECDH_PATH} (v${aliceEcdhRes.data!.version}), ${SIGNING_PATH} (v${aliceSignRes.data!.version})`);

    console.log("Storing Bob's keys in his vault...");
    const bobEcdhRes = await bobClient.secrets.set(
        BOB_VAULT_ID,
        ECDH_PATH,
        exportEcdhPrivateBase64(bobKeys.ecdhPrivate),
        { type: "generic", metadata: { purpose: "ecdh-demo" } },
    );
    const bobSignRes = await bobClient.secrets.set(
        BOB_VAULT_ID,
        SIGNING_PATH,
        exportSignPrivateKeyToBase64(bobKeys.signPrivateKey),
        { type: "generic", metadata: { purpose: "ecdh-demo" } },
    );
    if (bobEcdhRes.error || bobSignRes.error) {
        console.error("Bob vault:", bobEcdhRes.error?.message ?? bobSignRes.error?.message);
        process.exit(1);
    }
    console.log(`  ${ECDH_PATH} (v${bobEcdhRes.data!.version}), ${SIGNING_PATH} (v${bobSignRes.data!.version})`);

    console.log("\nDone. Run the ECDH demo with two env configs:");
    console.log("  Alice: ONECLAW_VAULT_ID=" + ALICE_VAULT_ID + " ONECLAW_API_KEY=<alice-key> ...");
    console.log("  Bob:   ONECLAW_VAULT_ID=" + BOB_VAULT_ID + " ONECLAW_API_KEY=<bob-key> ...");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
