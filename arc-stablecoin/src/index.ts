/**
 * 1Claw Intents API — Arc Stablecoin Transfer
 *
 * Demonstrates signing a native USDC transfer on Arc Testnet using the
 * 1Claw Intents API. Arc is a stablecoin-native EVM L2 where USDC is the
 * native gas token — every transaction fee is paid in USDC.
 *
 * What this script does:
 *   1. Create a vault
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
    if (state.agentId) {
      await client.agents.delete(state.agentId);
      console.log("  Agent deleted.");
    }
  } catch {}
  try {
    if (state.secretWritten && state.vaultId) {
      await client.secrets.delete(state.vaultId, KEY_PATH);
      console.log("  Signing key deleted.");
    }
  } catch {}
  try {
    if (state.vaultCreated && state.vaultId) {
      await client.vault.delete(state.vaultId);
      console.log("  Vault deleted.");
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
    const vaultRes = await client.vault.create({
      name: `arc-demo-${Date.now()}`,
      description: "Arc stablecoin Intents API demo",
    });
    if (vaultRes.error) {
      console.error("  Failed:", vaultRes.error.message);
      return;
    }
    const vault = vaultRes.data!;
    state.vaultId = vault.id;
    state.vaultCreated = true;
    console.log(`   Vault: ${vault.id}`);

    // 2. Generate signing key and derive address
    console.log("2️⃣  Generating signing key...");
    const privKeyHex = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
    const account = privateKeyToAccount(privKeyHex);
    console.log(`   Address: ${account.address}`);
    console.log(
      `   ⚠️  Fund this address with USDC on Arc Testnet: https://faucet.circle.com`
    );

    // 3. Store the private key in the vault
    console.log("3️⃣  Storing signing key in vault...");
    const putRes = await client.secrets.set(vault.id, KEY_PATH, privKeyHex, {
      type: "private_key",
      metadata: { chain: CHAIN, address: account.address },
    });
    if (putRes.error) {
      console.error("  Failed:", putRes.error.message);
      return;
    }
    state.secretWritten = true;
    console.log(`   Stored: ${putRes.data!.path} (v${putRes.data!.version})`);

    // 4. Register an Intents-API-enabled agent bound to arc-testnet
    console.log("4️⃣  Registering agent (Intents API + arc-testnet)...");
    const agentRes = await client.agents.create({
      name: `arc-demo-agent-${Date.now()}`,
      description: "Demo agent for Arc stablecoin transfers",
      auth_method: "api_key",
      intents_api_enabled: true,
      vault_ids: [vault.id],
      tx_allowed_chains: [CHAIN],
      tx_to_allowlist: [RECIPIENT],
      tx_max_value_eth: "1",
      tx_daily_limit_eth: "10",
    });
    if (agentRes.error) {
      console.error("  Failed:", agentRes.error.message);
      return;
    }
    const agent = agentRes.data!;
    state.agentId = agent.agent.id;
    state.agentApiKey = agent.api_key;
    console.log(`   Agent: ${agent.agent.id}`);
    console.log(`   Guardrails: chains=[${CHAIN}], to=[${RECIPIENT.slice(0, 10)}...], max=1 USDC/tx, 10 USDC/day`);

    // 5. Grant agent read access to the signing key
    console.log("5️⃣  Granting agent read access...");
    const polRes = await client.access.grantAgent(
      vault.id,
      agent.agent.id,
      ["read"],
      { secretPathPattern: "keys/**" },
    );
    if (polRes.error) {
      console.error("  Policy failed:", polRes.error.message);
      return;
    }
    console.log(`   Policy: ${polRes.data!.secret_path_pattern} → [${polRes.data!.permissions}]`);

    // 6. Submit the transaction via Intents API
    console.log("6️⃣  Submitting USDC transfer on Arc Testnet...");
    const agentClient = createClient({
      baseUrl: BASE_URL,
      apiKey: agent.api_key,
      agentId: agent.agent.id,
    });

    const txRes = await agentClient.agents.submitTransaction(agent.agent.id, {
      chain: CHAIN,
      to: RECIPIENT,
      value: "0.001",
      signing_key_path: KEY_PATH,
      max_fee_per_gas: "20000000000",
      max_priority_fee_per_gas: "1000000000",
    });

    if (txRes.error) {
      const msg = txRes.error.message ?? "";
      if (msg.includes("insufficient funds") || msg.includes("nonce") || msg.includes("balance")) {
        console.log(`\n   Expected: ${msg}`);
        console.log("   (Random key has no USDC. Fund the address above and rerun with -k.)");
      } else {
        console.error(`\n   ❌ Tx error: ${msg}`);
      }
    } else {
      const tx = txRes.data!;
      console.log("\n--- Result ---");
      console.log(`Status:   ${tx.status}`);
      console.log(`TX hash:  ${tx.tx_hash ?? "n/a"}`);
      console.log(`From:     ${account.address}`);
      if (tx.status === "broadcast") {
        console.log(`Explorer: https://testnet.arcscan.app/tx/${tx.tx_hash}`);
      } else if (tx.signed_tx) {
        console.log(`Signed:   ${tx.signed_tx.slice(0, 40)}...`);
        console.log("(Not broadcast — address likely needs USDC for gas)");
      }
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
