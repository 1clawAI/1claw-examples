/**
 * Remove ECDH demo secrets from both 1Claw vaults.
 * Uses the same env vars as bootstrap: ONECLAW_ALICE_*, ONECLAW_BOB_*.
 *
 *   npm run ecdh:cleanup
 */

import { createClient } from "@1claw/sdk";

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

    console.log("Removing ECDH demo secrets from Alice's vault...");
    const a1 = await aliceClient.secrets.delete(ALICE_VAULT_ID, ECDH_PATH);
    const a2 = await aliceClient.secrets.delete(ALICE_VAULT_ID, SIGNING_PATH);
    if (a1.error) console.warn("  keys/ecdh:", a1.error.message);
    else console.log("  deleted keys/ecdh");
    if (a2.error) console.warn("  keys/signing:", a2.error.message);
    else console.log("  deleted keys/signing");

    console.log("Removing ECDH demo secrets from Bob's vault...");
    const b1 = await bobClient.secrets.delete(BOB_VAULT_ID, ECDH_PATH);
    const b2 = await bobClient.secrets.delete(BOB_VAULT_ID, SIGNING_PATH);
    if (b1.error) console.warn("  keys/ecdh:", b1.error.message);
    else console.log("  deleted keys/ecdh");
    if (b2.error) console.warn("  keys/signing:", b2.error.message);
    else console.log("  deleted keys/signing");

    console.log("Cleanup done.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
