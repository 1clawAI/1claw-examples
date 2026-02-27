/**
 * 1Claw SDK — Signup & Share Example
 *
 * Demonstrates the invite-by-email flow:
 * 1. Sign up a new user via the API (requires email verification in production)
 * 2. Create a vault and store a secret
 * 3. Share the secret with someone by email
 * 4. The recipient will see the shared secret when they log in
 *
 * NOTE: In production, signup returns a verification email instead of a JWT.
 * This example falls back to ONECLAW_API_KEY for authentication when signup
 * doesn't return a token (the typical production case).
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;

async function main() {
    const client = createClient({ baseUrl: BASE_URL });

    // ── 1. Sign up or authenticate ──────────────────────────────────
    console.log("--- Signing up ---");
    const signupRes = await client.auth.signup({
        email: `demo-${Date.now()}@example.com`,
        password: "D3mo!Passw0rd#x7",
        display_name: "Demo User",
    });

    if (signupRes.data?.access_token) {
        console.log("Account created with immediate JWT (dev mode).");
    } else if (signupRes.error) {
        console.error("Signup failed:", signupRes.error.message);
        if (!API_KEY) return;
        console.log("Falling back to ONECLAW_API_KEY for the rest of the demo.");
    } else {
        console.log("Signup succeeded — verification email sent (production mode).");
        if (!API_KEY) {
            console.log("Set ONECLAW_API_KEY to continue the demo without email verification.");
            return;
        }
        console.log("Using ONECLAW_API_KEY for the rest of the demo.\n");
    }

    if (!signupRes.data?.access_token && API_KEY) {
        const authRes = AGENT_ID
            ? await client.auth.agentToken({ api_key: API_KEY, agent_id: AGENT_ID })
            : await client.auth.apiKeyToken({ api_key: API_KEY });
        if (authRes.error) {
            console.error("Auth failed:", authRes.error.message);
            return;
        }
    }

    // ── 2. Create or use existing vault and store a secret ─────────
    console.log("--- Creating vault + secret ---");
    let vault: { id: string; name: string };
    let vaultCreated = false;
    if (VAULT_ID) {
        const listRes = await client.vault.list();
        const existing = listRes.data?.vaults?.find((v) => v.id === VAULT_ID);
        if (existing) {
            vault = existing;
            console.log(`Using existing vault: ${vault.name} (${vault.id})`);
        } else {
            console.error("ONECLAW_VAULT_ID set but vault not found.");
            return;
        }
    } else {
        const vaultRes = await client.vault.create({
            name: "shared-vault",
            description: "Vault with secrets to share",
        });
        if (vaultRes.error) {
            if (vaultRes.error.message?.includes("Vault limit")) {
                const listRes = await client.vault.list();
                const first = listRes.data?.vaults?.[0];
                if (first) {
                    vault = first;
                    console.log(`Vault limit; using existing: ${vault.name} (${vault.id})`);
                } else {
                    console.error("Failed:", vaultRes.error.message);
                    return;
                }
            } else {
                console.error("Failed:", vaultRes.error.message);
                return;
            }
        } else {
            vault = vaultRes.data!;
            vaultCreated = true;
            console.log(`Vault: ${vault.name} (${vault.id})`);
        }
    }

    const putRes = await client.secrets.set(
        vault.id,
        "DATABASE_URL",
        "postgres://user:pass@host/db",
        {
            type: "password",
        },
    );
    if (putRes.error) {
        console.error("Failed:", putRes.error.message);
        // Fall through to cleanup: we still have a vault to delete
    } else {
        console.log(`Secret stored: ${putRes.data!.path}`);
    }

    // ── 3. Share the secret by email ───────────────────────────────
    console.log("\n--- Sharing secret by email ---");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);

    const shareRes = await client.sharing.create(putRes.data!.id, {
        recipient_type: "external_email",
        email: "colleague@example.com",
        expires_at: tomorrow.toISOString(),
        max_access_count: 3,
    });
    if (shareRes.error) {
        console.error("Share failed:", shareRes.error.message);
    } else {
        const share = shareRes.data!;
        console.log(`Shared!`);
        console.log(`  Share ID: ${share.id}`);
        console.log(`  Recipient: ${share.recipient_email}`);
        console.log(`  Expires: ${share.expires_at}`);
        console.log(`  Max accesses: ${share.max_access_count}`);
        console.log(`  URL: ${share.share_url}`);

        console.log(
            "\nWhen colleague@example.com signs up or logs in, " +
                "they will automatically see this shared secret.",
        );
    }

    // ── 4. Clean up ────────────────────────────────────────────────
    console.log("\n--- Cleaning up ---");
    if (putRes.data) {
        const delRes = await client.secrets.delete(vault.id, "DATABASE_URL");
        if (!delRes.error) console.log("Secret DATABASE_URL deleted.");
    }
    if (vaultCreated) {
        const vaultDelRes = await client.vault.delete(vault.id);
        if (vaultDelRes.error) {
            console.error("Failed to delete vault:", vaultDelRes.error.message);
        } else {
            console.log("Vault deleted.");
        }
    } else {
        console.log("Left existing vault in place.");
    }

    console.log("\nDone!");
}

main().catch(console.error);
