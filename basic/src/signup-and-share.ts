/**
 * 1Claw SDK — Signup & Share Example
 *
 * Demonstrates the invite-by-email flow:
 * 1. Sign up a new user via the API
 * 2. Create a vault and store a secret
 * 3. Share the secret with someone by email
 * 4. The recipient will see the shared secret when they log in
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

async function main() {
  // ── 1. Sign up a new account ───────────────────────────────────
  console.log("--- Signing up ---");
  const client = createClient({ baseUrl: BASE_URL });

  const signupRes = await client.auth.signup({
    email: `demo-${Date.now()}@example.com`,
    password: "secure-password-123",
    display_name: "Demo User",
  });
  if (signupRes.error) {
    console.error("Signup failed:", signupRes.error.message);
    return;
  }
  console.log("Account created! JWT received.");

  // ── 2. Create a vault and store a secret ───────────────────────
  console.log("\n--- Creating vault + secret ---");
  const vaultRes = await client.vault.create({
    name: "shared-vault",
    description: "Vault with secrets to share",
  });
  if (vaultRes.error) {
    console.error("Failed:", vaultRes.error.message);
    return;
  }
  const vault = vaultRes.data!;
  console.log(`Vault: ${vault.name} (${vault.id})`);

  const putRes = await client.secrets.set(vault.id, "DATABASE_URL", "postgres://user:pass@host/db", {
    type: "password",
  });
  if (putRes.error) {
    console.error("Failed:", putRes.error.message);
    return;
  }
  console.log(`Secret stored: ${putRes.data!.path}`);

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
    return;
  }

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

main().catch(console.error);
