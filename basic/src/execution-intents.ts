/**
 * 1Claw SDK — Execution Intents Example
 *
 * Demonstrates creating bindings with both credential strategies:
 *
 * 1. **Inline credential** (legacy) — the credential value is encrypted and
 *    stored in the __agent-keys vault.  Simple, but rotating the secret
 *    requires updating the binding.
 *
 * 2. **Vault-ref credential** — the binding points to an existing vault secret
 *    via `credential_source: { type: "vault_ref", vault_id, path }`.
 *    At execution time the server resolves the live secret value, so rotating
 *    the upstream secret automatically updates every binding that references it.
 *
 * Prerequisites:
 *   - ONECLAW_API_KEY set in your environment / .env
 *   - Pro+ plan (Execution Intents require Pro or higher)
 */

import { createClient } from "@1claw/sdk";
import type { CredentialSource } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const API_KEY = process.env.ONECLAW_API_KEY;

if (!API_KEY) {
    console.error("Set ONECLAW_API_KEY in your environment or .env file");
    process.exit(1);
}

async function main() {
    const client = createClient({ baseUrl: BASE_URL, apiKey: API_KEY });
    await new Promise((r) => setTimeout(r, 1000));

    // ── 1. Create a vault for API credentials ──────────────────────
    console.log("--- Creating vault ---");
    const vaultRes = await client.vault.create({
        name: "api-credentials",
        description: "Vault for third-party API keys used by Execution Intents",
    });
    if (vaultRes.error) {
        console.error("Failed:", vaultRes.error.message);
        return;
    }
    const vault = vaultRes.data!;
    console.log(`Vault: ${vault.name} (${vault.id})`);

    // ── 2. Store a Stripe API key as a vault secret ────────────────
    console.log("\n--- Storing Stripe API key in vault ---");
    const putRes = await client.secrets.set(
        vault.id,
        "integrations/stripe-key",
        "sk_test_demo_stripe_key_12345",
        {
            type: "api_key",
            metadata: { provider: "stripe", environment: "test" },
        },
    );
    if (putRes.error) {
        console.error("Failed:", putRes.error.message);
    } else {
        console.log(`Secret stored: ${putRes.data!.path} (v${putRes.data!.version})`);
    }

    // ── 3. Register an agent with Execution Intents enabled ────────
    console.log("\n--- Registering agent with Execution Intents ---");
    const agentRes = await client.agents.create({
        name: "api-caller-bot",
        description: "Agent that calls external APIs via Execution Intents",
        auth_method: "api_key",
        execution_intents_enabled: true,
    });
    if (agentRes.error) {
        console.error("Failed:", agentRes.error.message);
        return;
    }
    const agent = agentRes.data!;
    console.log(`Agent: ${agent.agent.name} (${agent.agent.id})`);
    console.log(`  execution_intents_enabled: ${agent.agent.execution_intents_enabled}`);

    // ── 4. Create a binding with an INLINE credential ──────────────
    console.log("\n--- Creating binding (inline credential) ---");
    const inlineBinding = await client.bindings.create(agent.agent.id, {
        name: "github-api",
        binding_type: "http",
        config: {
            base_url: "https://api.github.com",
            allowed_hosts: ["api.github.com"],
            allowed_paths: ["/repos/*", "/user"],
        },
        credential: {
            type: "bearer",
            token: "ghp_demo_github_token_12345",
        },
    });
    if (inlineBinding.error) {
        console.error("Failed:", inlineBinding.error.message);
    } else {
        const b = inlineBinding.data!;
        console.log(`  Binding: ${b.name} (${b.id})`);
        console.log(`  credential_set: ${b.credential_set}`);
        console.log(`  credential_source_type: ${b.credential_source_type ?? "inline"}`);
    }

    // ── 5. Create a binding with a VAULT-REF credential ────────────
    //    This binding points to the Stripe key stored in step 2.
    //    At execution time, 1Claw resolves the live secret value —
    //    rotating the vault secret automatically updates this binding.
    console.log("\n--- Creating binding (vault-ref credential) ---");
    const vaultRefSource: CredentialSource = {
        type: "vault_ref",
        vault_id: vault.id,
        path: "integrations/stripe-key",
    };
    const vaultRefBinding = await client.bindings.create(agent.agent.id, {
        name: "stripe-api",
        binding_type: "http",
        config: {
            base_url: "https://api.stripe.com",
            allowed_hosts: ["api.stripe.com"],
            allowed_paths: ["/v1/customers*", "/v1/charges*"],
        },
        credential_source: vaultRefSource,
    });
    if (vaultRefBinding.error) {
        console.error("Failed:", vaultRefBinding.error.message);
    } else {
        const b = vaultRefBinding.data!;
        console.log(`  Binding: ${b.name} (${b.id})`);
        console.log(`  credential_set: ${b.credential_set}`);
        console.log(`  credential_source_type: ${b.credential_source_type}`);
        console.log(`  credential_vault_id: ${b.credential_vault_id}`);
        console.log(`  credential_path: ${b.credential_path}`);
    }

    // ── 6. List bindings ───────────────────────────────────────────
    console.log("\n--- Listing bindings ---");
    const listRes = await client.bindings.list(agent.agent.id);
    if (listRes.error) {
        console.error("Failed:", listRes.error.message);
    } else {
        for (const b of listRes.data!.bindings) {
            const sourceLabel =
                b.credential_source_type === "vault_ref"
                    ? `vault_ref → ${b.credential_path}`
                    : "inline (HSM-encrypted)";
            console.log(`  ${b.name} (${b.binding_type}) — ${sourceLabel}`);
        }
    }

    // ── 7. Rotate the vault secret — vault-ref bindings auto-update
    console.log("\n--- Rotating vault secret (vault-ref bindings auto-update) ---");
    const rotateRes = await client.secrets.set(
        vault.id,
        "integrations/stripe-key",
        "sk_test_rotated_stripe_key_67890",
        { type: "api_key" },
    );
    if (rotateRes.error) {
        console.error("Failed:", rotateRes.error.message);
    } else {
        console.log(`  New version: v${rotateRes.data!.version}`);
        console.log("  The stripe-api binding now resolves the rotated key at execution time.");
    }

    // ── 8. Clean up ────────────────────────────────────────────────
    console.log("\n--- Cleaning up ---");
    if (inlineBinding.data) {
        await client.bindings.delete(agent.agent.id, inlineBinding.data.id);
        console.log("Binding github-api deleted.");
    }
    if (vaultRefBinding.data) {
        await client.bindings.delete(agent.agent.id, vaultRefBinding.data.id);
        console.log("Binding stripe-api deleted.");
    }
    await client.agents.delete(agent.agent.id);
    console.log("Agent deleted.");
    await client.secrets.delete(vault.id, "integrations/stripe-key");
    await client.vault.delete(vault.id);
    console.log("Vault and secret deleted.");

    console.log("\nDone!");
}

main().catch(console.error);
