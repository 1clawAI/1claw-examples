/**
 * Bootstrap: create agent + provision signing keys for all 6 chains.
 * Writes ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY to .env.local
 *
 * Prereq: ONECLAW_API_KEY (1ck_ human key) in .env.local
 * Run: npm run bootstrap
 */
import { createClient } from "@1claw/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SIGNING_KEY_CHAINS } from "../src/lib/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");

const BASE_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.co").trim();
const USER_API_KEY = (process.env.ONECLAW_API_KEY ?? "").trim();

function loadEnvFile() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function upsertEnv(key: string, value: string) {
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  content = re.test(content) ? content.replace(re, line) : `${content.trim()}\n${line}\n`;
  writeFileSync(envPath, content, "utf-8");
}

async function main() {
  loadEnvFile();
  const apiKey = USER_API_KEY || process.env.ONECLAW_API_KEY || "";

  if (!apiKey || apiKey.includes("your")) {
    console.error("Set ONECLAW_API_KEY (1ck_...) in .env.local");
    console.error("Get one at https://1claw.co/settings/api-keys");
    process.exit(1);
  }

  console.log("1Claw multichain bootstrap\n");

  const client = createClient({ baseUrl: BASE_URL, apiKey });
  const auth = await client.auth.apiKeyToken({ api_key: apiKey });
  if (auth.error) {
    console.error("Auth failed:", auth.error.message);
    process.exit(1);
  }

  const existingId = process.env.ONECLAW_AGENT_ID?.trim();
  let agentId = existingId;
  let agentApiKey = process.env.ONECLAW_AGENT_API_KEY?.trim();

  if (agentId && agentApiKey) {
    console.log("Reusing agent from .env.local:", agentId);
  } else {
    const created = await client.agents.create({
      name: `multichain-demo-${Date.now().toString(36)}`,
      description: "Multichain agent demo — 6-chain Intents API signing",
      intents_api_enabled: true,
    });
    if (created.error || !created.data?.agent) {
      console.error("Create agent failed:", created.error?.message);
      process.exit(1);
    }
    agentId = created.data.agent.id;
    agentApiKey = created.data.api_key;
    if (!agentApiKey) {
      console.error("No agent API key returned");
      process.exit(1);
    }
    console.log("Created agent:", agentId);
  }

  const keysRes = await client.signingKeys.list(agentId!);
  const existing = new Set(
    (keysRes.data?.keys ?? [])
      .filter((k) => k.is_active)
      .map((k) => k.chain),
  );

  for (const chain of SIGNING_KEY_CHAINS) {
    if (existing.has(chain)) {
      console.log(`  ✓ ${chain} key already provisioned`);
      continue;
    }
    const res = await client.signingKeys.create(agentId!, { chain });
    if (res.error) {
      console.error(`  ✗ ${chain}:`, res.error.message);
      continue;
    }
    console.log(`  + ${chain} → ${res.data?.address ?? "(no address)"}`);
  }

  upsertEnv("ONECLAW_BASE_URL", BASE_URL);
  upsertEnv("ONECLAW_AGENT_ID", agentId!);
  upsertEnv("ONECLAW_AGENT_API_KEY", agentApiKey!);

  console.log("\nUpdated .env.local");
  console.log("Next: npm run dev → open http://localhost:3010");
  console.log("Fund testnet addresses from the Funding panel (or manual faucets).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
