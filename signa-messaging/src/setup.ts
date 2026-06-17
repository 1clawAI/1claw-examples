/**
 * Setup: create a 1Claw vault + agent with EIP-191 message signing enabled,
 * then print the custodied address + agent credentials to drop into .env.
 *
 * The agent's key is provisioned and held in 1Claw's HSM/TEE — it never
 * leaves. `npm run send` then uses it to sign SIGNA messages.
 */
import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;

if (!API_KEY) {
    console.error("❌ ONECLAW_API_KEY is required. Set it in .env");
    process.exit(1);
}

async function main() {
    const client = createClient({ baseUrl: BASE_URL, apiKey: API_KEY! });

    // ── 1. Vault ────────────────────────────────────────────────────────
    console.log("\n🔐 Setting up vault...\n");
    const vaults = await client.vault.list();
    if (vaults.error) {
        console.error("Failed to list vaults:", vaults.error);
        process.exit(1);
    }
    let vaultId = vaults.data!.vaults.find((v) => v.name === "signa-messaging-vault")?.id;
    if (!vaultId) {
        const created = await client.vault.create({
            name: "signa-messaging-vault",
            description: "Vault for the SIGNA messaging signing key",
        });
        if (created.error) {
            console.error("Failed to create vault:", created.error);
            process.exit(1);
        }
        vaultId = created.data!.id;
        console.log(`  Created vault: ${vaultId}`);
    } else {
        console.log(`  Using existing vault: ${vaultId}`);
    }

    // ── 2. Agent with message signing (Base) ────────────────────────────
    console.log("\n🤖 Creating agent with EIP-191 message signing...\n");
    const agentResult = await client.agents.create({
        name: "signa-messaging-agent",
        description: "Signs SIGNA wallet-signed messages with a custodied key",
        intents_api_enabled: true,
        tx_allowed_chains: ["base"],
        vault_ids: [vaultId],
    });
    if (agentResult.error) {
        console.error("Failed to create agent:", agentResult.error);
        process.exit(1);
    }
    const { agent, api_key: agentApiKey } = agentResult.data!;

    // message signing is enabled via update
    const upd = await client.agents.update(agent.id, { message_signing_enabled: true });
    if (upd.error) console.warn("  (could not auto-enable message signing — enable it in the dashboard)");

    // ── 3. Recover the custodied address via a probe personal_sign ──────
    const probe = await createClient({ baseUrl: BASE_URL, apiKey: agentApiKey, agentId: agent.id })
        .agents.sign(agent.id, { intent_type: "personal_sign", chain: "base", message: "signa:setup-probe" });
    const address = probe.data?.from ?? "(sign a message to reveal — see send-signed-dm.ts)";

    console.log("\n✅ Setup complete. Add these to your .env:\n");
    console.log(`  ONECLAW_AGENT_ID=${agent.id}`);
    console.log(`  ONECLAW_AGENT_API_KEY=${agentApiKey}`);
    console.log(`  ONECLAW_AGENT_ADDRESS=${address}`);
    console.log("\nThen: npm run send\n");
}

main().catch((err) => {
    console.error("\n❌ Unexpected error:", err);
    process.exit(1);
});
