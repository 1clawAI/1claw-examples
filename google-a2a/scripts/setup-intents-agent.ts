/**
 * Bootstrap script — provisions a 1Claw agent with Intents API for the A2A demo.
 *
 * Usage:
 *   ONECLAW_API_KEY=1ck_your_human_key npx tsx scripts/setup-intents-agent.ts
 *
 * Creates:
 *   1. A vault (a2a-intents-demo)
 *   2. An agent with intents_api_enabled, shroud_enabled, and transaction guardrails
 *   3. A Base Sepolia signing key for the agent
 *   4. An access policy granting the agent read on **
 *
 * Outputs .env.intents with the agent credentials ready for the demo.
 */

import { createInterface } from "readline";

const API_KEY = process.argv.find((a) => a.startsWith("--api-key="))?.split("=")[1]
    ?? process.env.ONECLAW_API_KEY;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

if (!API_KEY || !API_KEY.startsWith("1ck_")) {
    console.error("Provide a human API key (1ck_...) via ONECLAW_API_KEY or --api-key=");
    console.error("Get one at: https://1claw.xyz/settings/api-keys");
    process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
function prompt(q: string, fallback: string): Promise<string> {
    if (!process.stdin.isTTY) return Promise.resolve(fallback);
    return new Promise((resolve) => {
        rl.question(q, (answer) => resolve(answer.trim() || fallback));
    });
}

async function api(method: string, path: string, body?: unknown) {
    const tokenResp = await fetch(`${BASE_URL}/v1/auth/api-key-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: API_KEY }),
    });
    const { access_token } = await tokenResp.json() as { access_token: string };

    const resp = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${access_token}`,
            "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(`${method} ${path} → ${resp.status}: ${JSON.stringify(data)}`);
    }
    return data;
}

async function main() {
    console.log("\n  1Claw × Google A2A — Intents API Setup\n");

    const network = await prompt("  Network [base-sepolia]: ", "base-sepolia");
    const maxValue = await prompt("  Max ETH per tx [0.01]: ", "0.01");
    const dailyLimit = await prompt("  Daily ETH limit [0.05]: ", "0.05");
    rl.close();

    console.log("\n  Provisioning...\n");

    // 1. Create vault (or reuse existing)
    let vault: { id: string };
    try {
        vault = await api("POST", "/v1/vaults", {
            name: "a2a-intents-demo",
            description: "Vault for Google A2A + Intents API demo",
        });
        console.log(`  ✓ Vault created: ${vault.id}`);
    } catch (e: any) {
        const vaults = await api("GET", "/v1/vaults");
        const existing = vaults.vaults?.find((v: any) => v.name === "a2a-intents-demo");
        if (existing) {
            vault = existing;
            console.log(`  ✓ Vault exists: ${vault.id}`);
        } else if (vaults.vaults?.length > 0) {
            vault = vaults.vaults[0];
            console.log(`  ✓ Using existing vault: ${vault.id} (${vaults.vaults[0].name})`);
        } else {
            throw e;
        }
    }

    // 2. Create agent with Intents API
    const chain = network.includes("sepolia") ? "base-sepolia" : "base";
    let agentData: { agent: { id: string }; api_key: string };
    try {
        agentData = await api("POST", "/v1/agents", {
            name: "a2a-intents-agent",
            description: "A2A worker agent with Intents API for transaction signing",
            intents_api_enabled: true,
            shroud_enabled: true,
            vault_ids: [vault.id],
            tx_allowed_chains: [chain],
            tx_max_value_eth: maxValue,
            tx_daily_limit_eth: dailyLimit,
            tx_to_allowlist: [],
        });
        console.log(`  ✓ Agent created: ${agentData.agent.id}`);
        console.log(`  ✓ Intents API: enabled`);
        console.log(`  ✓ Guardrails: max ${maxValue} ETH/tx, ${dailyLimit} ETH/day, chain: ${chain}`);
    } catch (e: any) {
        if (e.message?.includes("limit") || e.message?.includes("quota")) {
            console.error("\n  ✗ Agent limit reached. Delete unused agents at https://1claw.xyz/agents");
            process.exit(1);
        }
        throw e;
    }

    // 3. Provision signing key
    let signingKey: { address: string; public_key: string };
    try {
        const signingChain = chain.includes("sepolia") ? "ethereum" : "ethereum";
        signingKey = await api("POST", `/v1/agents/${agentData.agent.id}/signing-keys`, {
            chain: signingChain,
        });
        console.log(`  ✓ Signing key: ${signingKey.address}`);
    } catch (e: any) {
        if (e.message?.includes("already")) {
            const keys = await api("GET", `/v1/agents/${agentData.agent.id}/signing-keys`);
            signingKey = keys.signing_keys?.[0] ?? { address: "unknown", public_key: "" };
            console.log(`  ✓ Signing key exists: ${signingKey.address}`);
        } else {
            throw e;
        }
    }

    // 4. Create access policy
    try {
        await api("POST", `/v1/vaults/${vault.id}/policies`, {
            principal_type: "agent",
            principal_id: agentData.agent.id,
            permissions: ["read"],
            secret_path_pattern: "**",
        });
        console.log(`  ✓ Policy: read ** on vault`);
    } catch (e: any) {
        if (!e.message?.includes("already")) throw e;
        console.log(`  ✓ Policy exists`);
    }

    // 5. Write .env.intents
    const envContent = [
        `# Generated by setup-intents-agent.ts (${new Date().toISOString()})`,
        `ONECLAW_BASE_URL=${BASE_URL}`,
        `ONECLAW_VAULT_ID=${vault.id}`,
        `ONECLAW_AGENT_ID=${agentData.agent.id}`,
        `ONECLAW_API_KEY=${agentData.api_key}`,
        `INTENTS_CHAIN=${chain}`,
        `INTENTS_SIGNER_ADDRESS=${signingKey.address}`,
        `WORKER_PORT=4300`,
        "",
    ].join("\n");

    const fs = await import("fs");
    fs.writeFileSync(".env.intents", envContent);
    console.log(`\n  ✓ Wrote .env.intents\n`);

    console.log("  Next steps:");
    console.log("  1. Fund the signer on Base Sepolia:");
    console.log(`     Address: ${signingKey.address}`);
    console.log("     Faucet:  https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
    console.log("");
    console.log("  2. Run the demo:");
    console.log("     npm run intents");
    console.log("");
    console.log("  3. Or copy .env.intents → .env and run:");
    console.log("     cp .env.intents .env && npm start");
    console.log("");
}

main().catch((err) => {
    console.error("\n  ✗ Setup failed:", err.message ?? err);
    process.exit(1);
});
