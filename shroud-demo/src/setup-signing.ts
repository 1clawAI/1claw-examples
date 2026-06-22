/**
 * One-time setup: create a vault (if needed), store a test signing key at keys/base-signer,
 * and grant the demo agent read access so sign-only and real-tx work.
 *
 * Prereq: Run "npm run setup" first (creates agent and writes ONECLAW_AGENT_ID to .env).
 *         Set ONECLAW_API_KEY in .env (user API key from https://1claw.xyz/settings/api-keys).
 *
 * Run: npm run setup-signing
 */
import "./load-env.js";
import { createClient } from "@1claw/sdk";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const envPath = join(packageRoot, ".env");

const BASE_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.xyz").trim();
const USER_API_KEY = (process.env.ONECLAW_API_KEY ?? "").trim();

function getAgentIdFromEnv(): string | null {
  if (!existsSync(envPath)) return null;
  const content = readFileSync(envPath, "utf-8");
  const m = content.match(/ONECLAW_AGENT_ID=(.+)/m);
  const id = m?.[1]?.trim();
  if (!id || id === "your-agent-uuid") return null;
  return id;
}

async function main() {
  console.log("Shroud demo — signing setup\n");

  if (!USER_API_KEY || USER_API_KEY.startsWith("ocv_your_")) {
    console.log("Set ONECLAW_API_KEY in .env (user API key from https://1claw.xyz/settings/api-keys)");
    process.exit(1);
  }

  const agentId = getAgentIdFromEnv();
  if (!agentId) {
    console.log("Run 'npm run setup' first to create an agent and write ONECLAW_AGENT_ID to .env");
    process.exit(1);
  }

  const client = createClient({ baseUrl: BASE_URL });
  const authRes = await client.auth.apiKeyToken({ api_key: USER_API_KEY });
  if (authRes.error) {
    console.error("Auth failed:", authRes.error.message);
    process.exit(1);
  }

  // Use first vault or create one
  const listRes = await client.vault.list();
  if (listRes.error) {
    console.error("List vaults failed:", listRes.error.message);
    process.exit(1);
  }

  const vaults = listRes.data?.vaults ?? [];
  let vaultId: string;

  const existing = vaults.find((v: { id: string; name?: string }) => v.name === "shroud-demo-vault");
  if (existing) {
    vaultId = existing.id;
    console.log("Using existing vault:", vaultId, "(" + existing.name + ")");
  } else {
    const createRes = await client.vault.create({ name: "shroud-demo-vault", description: "For shroud-demo signing" });
    if (createRes.error || !createRes.data) {
      // At vault limit (free tier): use first existing vault
      if (vaults.length === 0) {
        console.error("Create vault failed:", createRes.error?.message ?? "no data");
        process.exit(1);
      }
      vaultId = vaults[0].id;
      console.log("Vault limit reached — using first vault:", vaultId, "(" + vaults[0].name + ")");
    } else {
      vaultId = createRes.data.id;
      console.log("Created vault:", vaultId);
    }
  }

  // Generate a test private key (32 bytes hex). For real use you'd use a funded key.
  const privateKeyHex = "0x" + randomBytes(32).toString("hex");
  const secretPath = "keys/base-signer";

  const putRes = await client.secrets.set(vaultId, secretPath, privateKeyHex, { type: "private_key" });
  if (putRes.error) {
    console.error("Put secret failed:", putRes.error.message);
    process.exit(1);
  }
  console.log("Stored signing key at path:", secretPath);

  const grantRes = await client.access.grantAgent(vaultId, agentId, ["read"], { secretPathPattern: "keys/**" });
  if (grantRes.error) {
    console.error("Grant agent failed:", grantRes.error.message);
    process.exit(1);
  }
  console.log("Granted agent read access on keys/**");

  console.log("\nDone. You can run:");
  console.log("  npm run real-sign-only   # sign only (no broadcast)");
  console.log("  npm run real-tx          # sign + broadcast (0 value to burn address)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
