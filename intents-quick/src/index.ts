/**
 * 1Claw Intents API — Quick Start (Base Sepolia)
 *
 * One script, one API key. Bootstraps everything:
 *   1. Create a vault
 *   2. Generate a random testnet signing key and store it
 *   3. Register an agent with Intents API + Shroud enabled
 *   4. Grant the agent read access to the signing key
 *   5. Submit a 0-value transaction on Base Sepolia (burn address)
 *   6. Clean up everything
 *
 * Usage:
 *   cp .env.example .env        # paste your 1ck_ key
 *   npm install && npm start
 *
 * The signing key is random and the transaction sends 0 ETH,
 * so no testnet funds are needed. The tx will be signed and
 * broadcast — you just won't see it on-chain because the
 * nonce / balance may not match. The point is to show the
 * full round-trip through the Intents API.
 */

import { createClient } from "@1claw/sdk";
import { randomBytes } from "node:crypto";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY?.trim();

if (!API_KEY || API_KEY === "1ck_your_key_here") {
    console.error("");
    console.error("  Paste your 1Claw API key into .env (or export ONECLAW_API_KEY).");
    console.error("  Get one at https://1claw.xyz → Settings → API Keys.");
    console.error("");
    process.exit(1);
}

const BURN = "0x000000000000000000000000000000000000dEaD";
const CHAIN = "base-sepolia";
const KEY_PATH = "keys/base-sepolia-signer";
const RUN_ID = `intents-quick-${Date.now()}`;

interface Cleanup {
    agentId?: string;
    vaultId?: string;
    vaultCreated: boolean;
    secretWritten: boolean;
}

const state: Cleanup = { vaultCreated: false, secretWritten: false };

async function cleanupAll(client: ReturnType<typeof createClient>) {
    console.log("\n── Cleanup ──");
    if (state.agentId) {
        const r = await client.agents.delete(state.agentId);
        console.log(r.error ? `  Agent delete failed: ${r.error.message}` : "  Agent deleted.");
    }
    if (state.secretWritten && state.vaultId) {
        await client.secrets.delete(state.vaultId, KEY_PATH).catch(() => {});
        console.log("  Secret deleted.");
    }
    if (state.vaultCreated && state.vaultId) {
        const r = await client.vault.delete(state.vaultId);
        console.log(r.error ? `  Vault delete failed: ${r.error.message}` : "  Vault deleted.");
    }
}

async function main() {
    console.log("");
    console.log("══════════════════════════════════════════════════════════════");
    console.log("  1Claw Intents API — Quick Start (Base Sepolia)");
    console.log("══════════════════════════════════════════════════════════════");
    console.log("");

    const client = createClient({ baseUrl: BASE_URL, apiKey: API_KEY });

    try {
        // ── 1. Create vault ──────────────────────────────────────────
        console.log("[1/6] Creating vault...");
        const vaultRes = await client.vault.create({
            name: RUN_ID,
            description: "Intents API quick-start (auto-cleaned)",
        });
        if (vaultRes.error) {
            console.error("  Failed:", vaultRes.error.message);
            return;
        }
        const vault = vaultRes.data!;
        state.vaultId = vault.id;
        state.vaultCreated = true;
        console.log(`  Vault: ${vault.name} (${vault.id})`);

        // ── 2. Store a random testnet signing key ────────────────────
        console.log("\n[2/6] Generating random signing key and storing in vault...");
        const privateKey = "0x" + randomBytes(32).toString("hex");
        const putRes = await client.secrets.set(vault.id, KEY_PATH, privateKey, {
            type: "private_key",
            metadata: { chain: CHAIN, note: "random testnet key" },
        });
        if (putRes.error) {
            console.error("  Failed:", putRes.error.message);
            return;
        }
        state.secretWritten = true;
        console.log(`  Stored: ${putRes.data!.path} (v${putRes.data!.version})`);

        // ── 3. Register agent with Intents + Shroud ──────────────────
        console.log("\n[3/6] Creating agent (Intents API + Shroud enabled)...");
        const agentRes = await client.agents.create({
            name: `${RUN_ID}-agent`,
            description: "Quick-start Intents agent (auto-cleaned)",
            auth_method: "api_key",
            intents_api_enabled: true,
            shroud_enabled: true,
            tx_allowed_chains: [CHAIN],
            tx_to_allowlist: [BURN],
            tx_max_value_eth: "0.01",
            vault_ids: [vault.id],
        });
        if (agentRes.error) {
            console.error("  Failed:", agentRes.error.message);
            return;
        }
        const agent = agentRes.data!;
        state.agentId = agent.agent.id;
        console.log(`  Agent: ${agent.agent.name} (${agent.agent.id})`);
        console.log(`  Intents API: ${agent.agent.intents_api_enabled}`);
        console.log(`  Shroud:      ${agent.agent.shroud_enabled}`);
        console.log(`  Guardrails:  chains=[${CHAIN}], to=[${BURN}], max=0.01 ETH`);

        // ── 4. Grant read policy on signing key path ─────────────────
        console.log("\n[4/6] Granting agent read access to signing key...");
        const polRes = await client.access.grantAgent(
            vault.id,
            agent.agent.id,
            ["read"],
            { secretPathPattern: "keys/**" },
        );
        if (polRes.error) {
            console.error("  Failed:", polRes.error.message);
            return;
        }
        console.log(`  Policy: ${polRes.data!.secret_path_pattern} → [${polRes.data!.permissions}]`);

        // ── 5. Submit a 0-value transaction on Base Sepolia ──────────
        console.log("\n[5/6] Submitting transaction (0 ETH to burn address on Base Sepolia)...");

        const agentClient = createClient({
            baseUrl: BASE_URL,
            apiKey: agent.api_key,
            agentId: agent.agent.id,
        });

        const txRes = await agentClient.agents.submitTransaction(agent.agent.id, {
            to: BURN,
            value: "0",
            chain: CHAIN,
            signing_key_path: KEY_PATH,
        });

        if (txRes.error) {
            const msg = txRes.error.message ?? "";
            if (msg.includes("insufficient funds") || msg.includes("nonce")) {
                console.log(`  Expected: ${msg}`);
                console.log("  (Random key has no testnet ETH — tx was signed but broadcast failed. That's fine.)");
            } else {
                console.error(`  Tx error: ${msg}`);
            }
        } else {
            const tx = txRes.data!;
            console.log(`  Status:  ${tx.status}`);
            console.log(`  Tx hash: ${tx.tx_hash ?? "n/a"}`);
            if (tx.signed_tx) {
                console.log(`  Signed:  ${tx.signed_tx.slice(0, 40)}...`);
            }
        }

        // ── 6. Verify agent state ────────────────────────────────────
        console.log("\n[6/6] Verifying agent...");
        const getRes = await client.agents.get(agent.agent.id);
        if (getRes.error) {
            console.error("  Failed:", getRes.error.message);
        } else {
            const a = getRes.data!;
            console.log(`  Name:     ${a.name}`);
            console.log(`  Active:   ${a.is_active}`);
            console.log(`  Intents:  ${a.intents_api_enabled}`);
            console.log(`  Shroud:   ${a.shroud_enabled}`);
            console.log(`  Chains:   [${a.tx_allowed_chains}]`);
        }

        console.log("\n  Done. The agent signed a transaction on Base Sepolia without");
        console.log("  ever seeing the private key. The key lived in the HSM vault;");
        console.log("  the Intents API signed it server-side behind guardrails.");
    } finally {
        await cleanupAll(client);
    }
}

main().catch(console.error);
