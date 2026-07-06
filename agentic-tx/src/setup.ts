import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL || "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;

if (!API_KEY) {
    console.error("❌ ONECLAW_API_KEY is required. Set it in .env");
    process.exit(1);
}

async function main() {
    const client = createClient({ baseUrl: BASE_URL, apiKey: API_KEY! });

    // ── 1. Create or reuse a vault ──────────────────────────────────────

    console.log("\n🔐 Setting up vault...\n");

    let vaultId: string;
    const vaultsResult = await client.vault.list();
    if (vaultsResult.error) {
        console.error("Failed to list vaults:", vaultsResult.error);
        process.exit(1);
    }

    const existingVault = vaultsResult.data!.vaults.find(
        (v) => v.name === "agentic-tx-vault",
    );

    if (existingVault) {
        vaultId = existingVault.id;
        console.log(`  Using existing vault: ${vaultId}`);
    } else {
        const createResult = await client.vault.create({
            name: "agentic-tx-vault",
            description: "Vault for agentic transaction signing keys",
        });
        if (createResult.error) {
            console.error("Failed to create vault:", createResult.error);
            process.exit(1);
        }
        vaultId = createResult.data!.id;
        console.log(`  Created vault: ${vaultId}`);
    }

    // ── 2. Create an agent with Intents API + guardrails ────────────────

    console.log("\n🤖 Creating agent with transaction guardrails...\n");

    const agentResult = await client.agents.create({
        name: "agentic-tx-agent",
        description:
            "Agent for on-chain transaction signing with safety guardrails",
        intents_api_enabled: true,
        tx_max_value: "0.01",
        tx_daily_limit: "0.05",
        tx_allowed_chains: ["ethereum", "base", "sepolia", "base-sepolia"],
        vault_ids: [vaultId],
    });

    if (agentResult.error) {
        console.error("Failed to create agent:", agentResult.error);
        process.exit(1);
    }

    const { agent, api_key: agentApiKey } = agentResult.data!;
    console.log(`  Agent ID:   ${agent.id}`);
    console.log(`  Agent name: ${agent.name}`);
    console.log(`  Intents:    ${agent.intents_api_enabled}`);

    // Enable message signing (only available via update)
    const updateResult = await client.agents.update(agent.id, {
        message_signing_enabled: true,
    });
    if (updateResult.error) {
        console.error(
            "Warning: could not enable message_signing:",
            updateResult.error,
        );
    } else {
        console.log(`  Msg sign:   ${updateResult.data!.message_signing_enabled}`);
    }

    // ── 3. Provision Ethereum signing key ───────────────────────────────

    console.log("\n🔑 Provisioning Ethereum signing key...\n");

    const keyResult = await client.signingKeys.create(agent.id, {
        chain: "ethereum",
    });

    if (keyResult.error) {
        console.error("Failed to provision signing key:", keyResult.error);
        process.exit(1);
    }

    const signingKey = keyResult.data!;
    const ethAddress = signingKey.address ?? "(address derivation pending)";

    console.log(`  Chain:      ${signingKey.chain}`);
    console.log(`  Curve:      ${signingKey.curve}`);
    console.log(`  Public key: ${signingKey.public_key.slice(0, 24)}...`);
    console.log(`  Address:    ${ethAddress}`);

    // ── 4. Print credentials (one-time display) ─────────────────────────

    console.log("\n" + "═".repeat(60));
    console.log("  SAVE THESE CREDENTIALS — they cannot be retrieved again!");
    console.log("═".repeat(60));
    console.log(`\n  ONECLAW_AGENT_ID=${agent.id}`);
    console.log(`  ONECLAW_AGENT_API_KEY=${agentApiKey ?? "(none — non-api_key auth)"}`);
    console.log(`  ONECLAW_VAULT_ID=${vaultId}`);
    console.log();

    // ── 5. Print funding instructions ───────────────────────────────────

    console.log("═".repeat(60));
    console.log("  Fund this address with ETH on the chains you want to");
    console.log("  transact on:");
    console.log("═".repeat(60));
    console.log(`\n  ${ethAddress}\n`);
    console.log(`  Ethereum mainnet : https://etherscan.io/address/${ethAddress}`);
    console.log(`  Base             : https://basescan.org/address/${ethAddress}`);
    console.log(`  Sepolia          : https://sepolia.etherscan.io/address/${ethAddress}`);
    console.log(`  Base Sepolia     : https://sepolia.basescan.org/address/${ethAddress}`);

    // ── 6. Next steps ───────────────────────────────────────────────────

    console.log("\n" + "─".repeat(60));
    console.log("  After funding, update .env with the agent credentials");
    console.log("  above, then run:\n");
    console.log("    npm run send-eth       # send ETH on mainnet");
    console.log("    npm run send-base      # send ETH on Base");
    console.log("    npm run multi-chain    # multi-chain demo");
    console.log("─".repeat(60) + "\n");
}

main().catch((err) => {
    console.error("\n❌ Setup failed:", err);
    process.exit(1);
});
