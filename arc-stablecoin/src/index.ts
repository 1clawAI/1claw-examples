/**
 * 1Claw Intents API — Arc Stablecoin Transfer
 *
 * Demonstrates signing a native USDC transfer on Arc Testnet using the
 * 1Claw Intents API. Arc is a stablecoin-native EVM L2 where USDC is the
 * native gas token — every transaction fee is paid in USDC.
 *
 * What this script does:
 *   1. Create a vault for the demo
 *   2. Generate a secp256k1 signing key, derive the Arc address, store it
 *   3. Register an agent with Intents API enabled and arc-testnet chain allowed
 *   4. Grant the agent read access to the signing key
 *   5. Submit a 0.001 USDC native transfer on Arc Testnet
 *   6. Clean up (unless --no-cleanup)
 *
 * Usage:
 *   cp .env.example .env   # paste your 1ck_ key
 *   npm install && npm start
 *
 * Fund the derived address from the Circle faucet (select Arc Testnet):
 *   https://faucet.circle.com
 */

import { createClient } from "@1claw/sdk";
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const args = process.argv.slice(2);
const NO_CLEANUP = args.includes("--no-cleanup") || args.includes("-k");
const positionalArgs = args.filter((a) => !a.startsWith("-"));
const API_KEY = positionalArgs[0]?.trim() || process.env.ONECLAW_API_KEY?.trim();

if (!API_KEY || API_KEY === "1ck_your_key_here") {
  console.error("");
  console.error("  Usage:  npm start -- 1ck_your_key_here [--no-cleanup]");
  console.error("  Or:     npx tsx src/index.ts 1ck_your_key_here --no-cleanup");
  console.error("");
  console.error("  Flags:");
  console.error("    --no-cleanup, -k   Keep vault/agent after run");
  console.error("");
  console.error("  Get a key at https://1claw.xyz → Settings → API Keys");
  console.error("");
  process.exit(1);
}

const RECIPIENT =
  process.env.ARC_RECIPIENT ?? "0x000000000000000000000000000000000000dEaD";
const CHAIN = "arc-testnet";
const KEY_PATH = "keys/arc-testnet-signer";

interface Cleanup {
  agentId?: string;
  agentApiKey?: string;
  vaultId?: string;
  vaultCreated: boolean;
  secretWritten: boolean;
}

const state: Cleanup = { vaultCreated: false, secretWritten: false };

async function cleanup(client: ReturnType<typeof createClient>) {
  if (NO_CLEANUP) {
    console.log("\n  --no-cleanup: keeping resources alive.");
    console.log(`  Vault: ${state.vaultId}`);
    console.log(`  Agent: ${state.agentId}`);
    return;
  }
  console.log("\n🧹 Cleaning up...");
  try {
    if (state.secretWritten && state.vaultId) {
      await client.secrets.delete(state.vaultId, KEY_PATH);
    }
  } catch {}
  try {
    if (state.agentId) {
      await client.agents.delete(state.agentId);
    }
  } catch {}
  try {
    if (state.vaultCreated && state.vaultId) {
      await client.vaults.delete(state.vaultId);
    }
  } catch {}
}

async function main() {
  console.log("=== 1Claw Intents API — Arc Stablecoin Transfer ===\n");
  console.log(`Chain:     ${CHAIN} (chain ID 5042002)`);
  console.log(`Gas token: USDC (native)`);
  console.log(`Recipient: ${RECIPIENT}\n`);

  const client = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
  });

  try {
    // 1. Create vault
    console.log("1️⃣  Creating vault...");
    const vault = await client.vaults.create({
      name: `arc-demo-${Date.now()}`,
      description: "Arc stablecoin Intents API demo",
    });
    state.vaultId = vault.id;
    state.vaultCreated = true;
    console.log(`   Vault: ${vault.id}`);

    // 2. Generate signing key and derive address
    console.log("2️⃣  Generating signing key...");
    const privKeyBytes = randomBytes(32);
    const privKeyHex = `0x${privKeyBytes.toString("hex")}` as `0x${string}`;
    const account = privateKeyToAccount(privKeyHex);
    console.log(`   Address: ${account.address}`);
    console.log(
      `   ⚠️  Fund this address with USDC on Arc Testnet: https://faucet.circle.com`
    );

    // 3. Store the private key in the vault
    console.log("3️⃣  Storing signing key in vault...");
    await client.secrets.put(state.vaultId, KEY_PATH, {
      value: privKeyHex,
      type: "private_key",
      description: "Arc Testnet secp256k1 signing key",
    });
    state.secretWritten = true;

    // 4. Register an Intents-API-enabled agent bound to arc-testnet
    console.log("4️⃣  Registering agent (Intents API + arc-testnet)...");
    const agent = await client.agents.create({
      name: `arc-demo-agent-${Date.now()}`,
      description: "Demo agent for Arc stablecoin transfers",
      intents_api_enabled: true,
      vault_ids: [state.vaultId],
      tx_allowed_chains: [CHAIN],
      tx_max_value_eth: "1", // 1 USDC max per tx (Arc uses USDC as native)
      tx_daily_limit_eth: "10", // 10 USDC daily cap
    });
    state.agentId = agent.id;
    state.agentApiKey = agent.api_key;
    console.log(`   Agent: ${agent.id}`);

    // 5. Grant agent read access to the signing key
    console.log("5️⃣  Granting agent read access...");
    await client.access.create(state.vaultId, {
      principal_type: "agent",
      principal_id: agent.id,
      secret_path_pattern: "keys/**",
      permissions: ["read"],
    });

    // 6. Exchange for agent token and submit transaction
    console.log("6️⃣  Submitting USDC transfer on Arc Testnet...");
    const agentClient = createClient({
      baseUrl: BASE_URL,
      apiKey: state.agentApiKey!,
      agentId: state.agentId!,
    });

    const txResult = await agentClient.agents.submitTransaction(
      state.agentId!,
      {
        chain: CHAIN,
        to: RECIPIENT,
        value: "0.001", // 0.001 USDC (native transfer)
        signing_key_path: KEY_PATH,
        max_fee_per_gas: "20000000000", // 20 Gwei minimum for Arc
        max_priority_fee_per_gas: "1000000000", // 1 Gwei tip
      }
    );

    console.log("\n--- Result ---");
    console.log(`Status:   ${txResult.status}`);
    console.log(`TX hash:  ${txResult.tx_hash}`);
    console.log(`From:     ${txResult.from}`);
    if (txResult.status === "broadcast") {
      console.log(
        `Explorer: https://testnet.arcscan.app/tx/${txResult.tx_hash}`
      );
    } else if (txResult.status === "signed") {
      console.log("  (Not broadcast — address likely needs USDC for gas)");
      console.log("  Fund it at https://faucet.circle.com and rerun with -k");
    }
    console.log("");
  } finally {
    await cleanup(client);
  }
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message ?? err);
  process.exit(1);
});
