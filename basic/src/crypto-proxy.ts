/**
 * 1Claw SDK — Crypto Transaction Proxy Example
 *
 * Demonstrates registering an agent with the crypto transaction proxy
 * enabled, granting it vault access, and checking its proxy status.
 *
 * The crypto proxy lets agents submit on-chain transaction intents
 * through a signing proxy — private keys never leave the HSM.
 *
 * Prerequisites:
 *   - ONECLAW_API_KEY set in your environment / .env
 *   - A vault with a stored signing key (e.g. "keys/base-signer")
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;

if (!API_KEY) {
    console.error("Set ONECLAW_API_KEY in your environment or .env file");
    process.exit(1);
}

async function main() {
    const client = createClient({ baseUrl: BASE_URL, apiKey: API_KEY });
    await new Promise((r) => setTimeout(r, 1000));

    // ── 1. Create a vault for signing keys ─────────────────────────
    console.log("--- Creating vault ---");
    const vaultRes = await client.vault.create({
        name: "signing-keys",
        description: "Vault for on-chain signing keys used by the proxy",
    });
    if (vaultRes.error) {
        console.error("Failed:", vaultRes.error.message);
        return;
    }
    const vault = vaultRes.data!;
    console.log(`Vault: ${vault.name} (${vault.id})`);

    // ── 2. Store a signing key in the vault ────────────────────────
    console.log("\n--- Storing signing key ---");
    const putRes = await client.secrets.set(vault.id, "keys/base-signer", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", {
        type: "private_key",
        metadata: { chain: "base", label: "DeFi bot signer" },
    });
    if (putRes.error) {
        console.error("Failed:", putRes.error.message);
        return;
    }
    console.log(`Key stored: ${putRes.data!.path} (v${putRes.data!.version})`);

    // ── 3. Register an agent WITH crypto proxy enabled ─────────────
    console.log("\n--- Registering agent with crypto proxy ---");
    const agentRes = await client.agents.create({
        name: "defi-bot",
        description: "Automated DeFi agent that submits transactions via the signing proxy",
        auth_method: "api_key",
        scopes: ["vault:read", "tx:sign"],
        crypto_proxy_enabled: true,
    });
    if (agentRes.error) {
        console.error("Failed:", agentRes.error.message);
        return;
    }
    const agent = agentRes.data!;
    console.log(`Agent: ${agent.agent.name} (${agent.agent.id})`);
    console.log(`  crypto_proxy_enabled: ${agent.agent.crypto_proxy_enabled}`);
    console.log(`  API key: ${agent.api_key.slice(0, 12)}...`);

    // ── 4. Grant the agent read access to the signing keys vault ───
    console.log("\n--- Granting vault access ---");
    const policyRes = await client.access.grantAgent(vault.id, {
        secret_path_pattern: "keys/**",
        principal_type: "agent",
        principal_id: agent.agent.id,
        permissions: ["read"],
    });
    if (policyRes.error) {
        console.error("Failed:", policyRes.error.message);
    } else {
        console.log(`Policy granted: ${policyRes.data!.secret_path_pattern} → [${policyRes.data!.permissions.join(", ")}]`);
    }

    // ── 5. Verify agent status ─────────────────────────────────────
    console.log("\n--- Verifying agent ---");
    const getRes = await client.agents.get(agent.agent.id);
    if (getRes.error) {
        console.error("Failed:", getRes.error.message);
    } else {
        const a = getRes.data!;
        console.log(`  Name: ${a.name}`);
        console.log(`  Active: ${a.is_active}`);
        console.log(`  Crypto proxy: ${a.crypto_proxy_enabled}`);
        console.log(`  Scopes: [${a.scopes.join(", ")}]`);
    }

    // ── 6. Toggle proxy off ────────────────────────────────────────
    console.log("\n--- Disabling crypto proxy ---");
    const updateRes = await client.agents.update(agent.agent.id, {
        crypto_proxy_enabled: false,
    });
    if (updateRes.error) {
        console.error("Failed:", updateRes.error.message);
    } else {
        console.log(`  crypto_proxy_enabled: ${updateRes.data!.crypto_proxy_enabled}`);
    }

    // ── 7. Clean up ────────────────────────────────────────────────
    console.log("\n--- Cleaning up ---");
    await client.agents.delete(agent.agent.id);
    await client.secrets.delete(vault.id, "keys/base-signer");
    await client.vault.delete(vault.id);
    console.log("Agent, key, and vault deleted.");

    console.log("\nDone!");
}

main().catch(console.error);
