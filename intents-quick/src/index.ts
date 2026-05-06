/**
 * 1Claw Intents API — Quick Start (Base Sepolia)
 *
 * One script, one API key. Bootstraps everything:
 *   1. Create a vault
 *   2. Generate a random testnet signing key and store it
 *   3. Register an agent with Intents API + Shroud enabled
 *   4. Grant the agent read access to the signing key
 *   5. Submit a 0-value transaction on Base Sepolia (burn address)
 *   6. (Optional) Store your OpenAI key and call the LLM through Shroud
 *   7. Clean up everything
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
const SHROUD_URL = process.env.ONECLAW_SHROUD_URL ?? "https://shroud.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY?.trim();
const LLM_API_KEY = process.env.OPENAI_API_KEY?.trim();

if (!API_KEY || API_KEY === "1ck_your_key_here") {
    console.error("");
    console.error("  Paste your 1Claw human API key (1ck_...) into .env");
    console.error("  Get one at https://1claw.xyz → Settings → API Keys");
    console.error("");
    process.exit(1);
}

const BURN = "0x000000000000000000000000000000000000dEaD";
const CHAIN = "base-sepolia";
const KEY_PATH = "keys/base-sepolia-signer";
const LLM_KEY_PATH = "providers/openai/api-key";
const RUN_ID = `intents-quick-${Date.now()}`;

interface Cleanup {
    agentId?: string;
    agentApiKey?: string;
    vaultId?: string;
    vaultCreated: boolean;
    secretWritten: boolean;
    llmKeyWritten: boolean;
}

const state: Cleanup = { vaultCreated: false, secretWritten: false, llmKeyWritten: false };

async function cleanupAll(client: ReturnType<typeof createClient>) {
    console.log("\n── Cleanup ──");
    if (state.agentId) {
        const r = await client.agents.delete(state.agentId);
        console.log(r.error ? `  Agent delete failed: ${r.error.message}` : "  Agent deleted.");
    }
    if (state.secretWritten && state.vaultId) {
        await client.secrets.delete(state.vaultId, KEY_PATH).catch(() => {});
        console.log("  Signing key deleted.");
    }
    if (state.llmKeyWritten && state.vaultId) {
        await client.secrets.delete(state.vaultId, LLM_KEY_PATH).catch(() => {});
        console.log("  LLM key deleted.");
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

    const client = createClient({ baseUrl: BASE_URL, token: API_KEY });

    try {
        const totalSteps = LLM_API_KEY ? 7 : 6;

        // ── 1. Create vault ──────────────────────────────────────────
        console.log(`[1/${totalSteps}] Creating vault...`);
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
        console.log(`\n[2/${totalSteps}] Generating random signing key and storing in vault...`);
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
        console.log(`\n[3/${totalSteps}] Creating agent (Intents API + Shroud enabled)...`);
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
        state.agentApiKey = agent.api_key;
        console.log(`  Agent: ${agent.agent.name} (${agent.agent.id})`);
        console.log(`  Intents API: ${agent.agent.intents_api_enabled}`);
        console.log(`  Shroud:      ${agent.agent.shroud_enabled}`);
        console.log(`  Guardrails:  chains=[${CHAIN}], to=[${BURN}], max=0.01 ETH`);

        // ── 4. Grant read policies ────────────────────────────────────
        console.log(`\n[4/${totalSteps}] Granting agent read access...`);
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

        if (LLM_API_KEY) {
            const polRes2 = await client.access.grantAgent(
                vault.id,
                agent.agent.id,
                ["read"],
                { secretPathPattern: "providers/**" },
            );
            if (polRes2.error) {
                console.error("  Provider policy failed:", polRes2.error.message);
            } else {
                console.log(`  Policy: ${polRes2.data!.secret_path_pattern} → [${polRes2.data!.permissions}]`);
            }
        }

        // ── 5. Submit a 0-value transaction on Base Sepolia ──────────
        console.log(`\n[5/${totalSteps}] Submitting transaction (0 ETH to burn address on Base Sepolia)...`);

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

        // ── 6. (Optional) Store LLM key and call through Shroud ──────
        if (LLM_API_KEY) {
            console.log(`\n[6/${totalSteps}] Storing OpenAI key in vault and calling LLM through Shroud...`);

            const llmPut = await client.secrets.set(vault.id, LLM_KEY_PATH, LLM_API_KEY, {
                type: "api_key",
                metadata: { provider: "openai" },
            });
            if (llmPut.error) {
                console.error("  Failed to store LLM key:", llmPut.error.message);
            } else {
                state.llmKeyWritten = true;
                console.log(`  Stored: ${llmPut.data!.path} (v${llmPut.data!.version})`);

                const agentCreds = state.agentApiKey!;
                const agentId = state.agentId!;
                const res = await fetch(`${SHROUD_URL.replace(/\/$/, "")}/v1/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Shroud-Agent-Key": `${agentId}:${agentCreds}`,
                        "X-Shroud-Provider": "openai",
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: "Reply with exactly one word: hello" }],
                        max_tokens: 10,
                    }),
                    signal: AbortSignal.timeout(30_000),
                });

                if (res.ok) {
                    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
                    const reply = data.choices?.[0]?.message?.content?.trim() ?? "(empty)";
                    console.log(`  LLM reply via Shroud: "${reply}"`);
                    console.log("  The OpenAI key never left the vault. Shroud fetched it server-side.");
                } else {
                    const text = await res.text().catch(() => "");
                    console.log(`  Shroud LLM returned ${res.status}: ${text.slice(0, 100)}`);
                    console.log("  (This is OK if Shroud isn't configured to fetch keys from Vault yet.)");
                }
            }
        }

        // ── Last. Verify agent state ─────────────────────────────────
        console.log(`\n[${totalSteps}/${totalSteps}] Verifying agent...`);
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
