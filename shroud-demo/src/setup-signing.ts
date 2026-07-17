/**
 * Optional follow-up to npm run setup: store keys/base-signer in a vault and
 * grant the demo agent read access on keys/**.
 */
import "./load-env.js";
import { createClient } from "@1claw/sdk";

const BASE_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.xyz").trim();
const USER_API_KEY = (process.env.ONECLAW_API_KEY ?? "").trim();
const AGENT_ID = (process.env.ONECLAW_AGENT_ID ?? "").trim();
const KEY_PATH = "keys/base-signer";
// Well-known Hardhat/Anvil test key — demo only; never use in production.
const DEMO_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  if (!USER_API_KEY || USER_API_KEY.includes("your")) {
    console.error("Set ONECLAW_API_KEY in .env (run npm run setup first).");
    process.exit(1);
  }
  if (!AGENT_ID || AGENT_ID === "your-agent-uuid") {
    console.error("Set ONECLAW_AGENT_ID in .env (run npm run setup first).");
    process.exit(1);
  }

  const client = createClient({ baseUrl: BASE_URL, apiKey: USER_API_KEY });
  const authRes = await client.auth.apiKeyToken({ api_key: USER_API_KEY });
  if (authRes.error) {
    console.error("Auth failed:", authRes.error.message);
    process.exit(1);
  }

  let vaultId: string | undefined;
  const listRes = await client.vault.list();
  vaultId = listRes.data?.vaults?.[0]?.id;
  if (!vaultId) {
    const createRes = await client.vault.create({
      name: "shroud-demo-signing",
      description: "Signing keys for shroud-demo",
    });
    if (createRes.error || !createRes.data) {
      console.error("Create vault failed:", createRes.error?.message ?? "no data");
      process.exit(1);
    }
    vaultId = createRes.data.id;
    console.log("Created vault:", vaultId);
  } else {
    console.log("Using vault:", vaultId);
  }

  const putRes = await client.secrets.set(vaultId, KEY_PATH, DEMO_PRIVATE_KEY, {
    type: "private_key",
    metadata: { chain: "base", label: "shroud-demo base signer" },
  });
  if (putRes.error) {
    console.error("Store signing key failed:", putRes.error.message);
    process.exit(1);
  }
  console.log(`Stored ${KEY_PATH} (v${putRes.data?.version ?? "?"})`);

  const policyRes = await client.access.grantAgent(
    vaultId,
    AGENT_ID,
    ["read"],
    { secretPathPattern: "keys/**" },
  );
  if (policyRes.error) {
    console.error("Grant policy failed:", policyRes.error.message);
    process.exit(1);
  }
  console.log("Granted agent read on keys/**");
  console.log("\nNext: npm run real-sign-only  or  npm run real-tx");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
