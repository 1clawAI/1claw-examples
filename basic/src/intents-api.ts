/**
 * 1Claw SDK — Intents API Example
 *
 * Demonstrates registering an agent with the Intents API
 * enabled, granting it vault access, and checking its status.
 *
 * The Intents API lets agents submit on-chain transaction intents
 * through a signing proxy — private keys never leave the HSM.
 *
 * Prerequisites:
 *   - ONECLAW_API_KEY set in your environment / .env
 *   - A vault with a stored signing key (e.g. "keys/base-signer")
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;

if (!API_KEY) {
    console.error("Set ONECLAW_API_KEY in your environment or .env file");
    process.exit(1);
}

async function main() {
    const client = createClient({ baseUrl: BASE_URL, apiKey: API_KEY });
    await new Promise((r) => setTimeout(r, 1000));

    // ── 1. Create or use existing vault for signing keys ──────────
    console.log("--- Creating vault ---");
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
            name: "signing-keys",
            description: "Vault for on-chain signing keys used by the proxy",
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

    // ── 2. Store a signing key in the vault ────────────────────────
    console.log("\n--- Storing signing key ---");
    const putRes = await client.secrets.set(
        vault.id,
        "keys/base-signer",
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        {
            type: "private_key",
            metadata: { chain: "base", label: "DeFi bot signer" },
        },
    );
    if (putRes.error) {
        console.error("Failed:", putRes.error.message);
        // Fall through to cleanup: we have a vault (and possibly need to delete it)
    } else {
        console.log(`Key stored: ${putRes.data!.path} (v${putRes.data!.version})`);
    }

    // ── 3. Register an agent WITH Intents API enabled ───────────────
    console.log("\n--- Registering agent with Intents API ---");
    const agentRes = await client.agents.create({
        name: "defi-bot",
        description:
            "Automated DeFi agent that submits transactions via the signing proxy",
        auth_method: "api_key",
        scopes: ["vault:read", "tx:sign"],
        intents_api_enabled: true,
    });
    let agent: { agent: { id: string }; api_key: string } | null = null;
    if (agentRes.error) {
        console.error("Failed:", agentRes.error.message);
        // Fall through to cleanup
    } else {
        agent = agentRes.data!;
        console.log(`Agent: ${agent.agent.name} (${agent.agent.id})`);
        console.log(`  intents_api_enabled: ${agent.agent.intents_api_enabled}`);
        console.log(`  API key: ${agent.api_key.slice(0, 12)}...`);
    }

    if (agent) {
        // ── 4. Grant the agent read access to the signing keys vault ───
        console.log("\n--- Granting vault access ---");
        const policyRes = await client.access.grantAgent(
            vault.id,
            agent.agent.id,
            ["read"],
            { secretPathPattern: "keys/**" },
        );
        if (policyRes.error) {
            console.error("Failed:", policyRes.error.message);
        } else if (policyRes.data) {
            console.log(
                `Policy granted: ${policyRes.data!.secret_path_pattern} → [${policyRes.data!.permissions.join(", ")}]`,
            );
        }
        // ── 5. Simulate a transaction (Tenderly) ─────────────────────
        console.log("\n--- Simulating transaction (Tenderly) ---");

        const agentClient = createClient({
            baseUrl: BASE_URL,
            apiKey: agent.api_key,
            agentId: agent.agent.id,
        });
        await new Promise((r) => setTimeout(r, 500));

        const simRes = await agentClient.agents.simulateTransaction(
            agent.agent.id,
            {
                to: "0x000000000000000000000000000000000000dEaD",
                value: "0.001",
                chain: "base",
            },
        );
        if (simRes.error) {
            console.error("Simulation failed:", simRes.error.message);
        } else {
            const sim = simRes.data!;
            console.log(`  Status: ${sim.status}`);
            console.log(`  Gas used: ${sim.gas_used}`);
            console.log(`  Balance changes: ${sim.balance_changes?.length ?? 0}`);
            if (sim.tenderly_dashboard_url) {
                console.log(`  Tenderly: ${sim.tenderly_dashboard_url}`);
            }
        }

        // ── 6. Submit with simulate_first (simulate-then-sign) ──────────
        console.log("\n--- Submitting transaction (simulate_first) ---");

        const txRes = await agentClient.agents.submitTransaction(agent.agent.id, {
            to: "0x000000000000000000000000000000000000dEaD",
            value: "0.001",
            chain: "base",
            simulate_first: true,
        });
        if (txRes.error) {
            console.error("Tx failed:", txRes.error.message);
        } else {
            const tx = txRes.data!;
            console.log(`  Status: ${tx.status}`);
            console.log(`  Tx hash: ${tx.tx_hash ?? "n/a"}`);
            console.log(
                `  Signed tx: ${tx.signed_tx ? tx.signed_tx.slice(0, 30) + "..." : "n/a"}`,
            );
            if (tx.simulation_id) {
                console.log(`  Simulation ID: ${tx.simulation_id}`);
            }
        }

        // ── 7. Verify agent status ─────────────────────────────────────
        console.log("\n--- Verifying agent ---");
        const getRes = await client.agents.get(agent.agent.id);
        if (getRes.error) {
            console.error("Failed:", getRes.error.message);
        } else {
            const a = getRes.data!;
            console.log(`  Name: ${a.name}`);
            console.log(`  Active: ${a.is_active}`);
            console.log(`  Intents API: ${a.intents_api_enabled}`);
            console.log(`  Scopes: [${a.scopes.join(", ")}]`);
        }

        // ── 8. Toggle Intents API off ───────────────────────────────────
        console.log("\n--- Disabling Intents API ---");
        const updateRes = await client.agents.update(agent.agent.id, {
            intents_api_enabled: false,
        });
        if (updateRes.error) {
            console.error("Failed:", updateRes.error.message);
        } else {
            console.log(
                `  intents_api_enabled: ${updateRes.data!.intents_api_enabled}`,
            );
        }
    }

    // ── 9. Clean up ────────────────────────────────────────────────
    console.log("\n--- Cleaning up ---");
    if (agent) {
        const agentDelRes = await client.agents.delete(agent.agent.id);
        if (!agentDelRes.error) console.log("Agent deleted.");
    }
    if (putRes.data) {
        const secretDelRes = await client.secrets.delete(vault.id, "keys/base-signer");
        if (!secretDelRes.error) console.log("Secret keys/base-signer deleted.");
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
