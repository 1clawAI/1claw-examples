/**
 * One-time setup: create an agent with Shroud enabled and write agent credentials to .env.
 * Prerequisite: org must already have LLM Token Billing enabled (Settings → Billing) if you
 * want agent JWTs to include llm_token_billing + stripe_customer_id.
 *
 * Run: npm run setup
 */
import "./load-env.js";
import { createClient } from "@1claw/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const envPath = join(packageRoot, ".env");

const BASE_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.co").trim();
const USER_API_KEY = (process.env.ONECLAW_API_KEY ?? "").trim();

function isPlaceholder(key: string): boolean {
  return !key || key.includes("your_") || key.endsWith("_here");
}

async function main() {
  console.log("shroud-llm example — env setup\n");

  if (!USER_API_KEY || isPlaceholder(USER_API_KEY)) {
    console.log("Set ONECLAW_API_KEY in .env (user API key from https://1claw.co/settings/api-keys)");
    console.log("Then run: npm run setup\n");
    process.exit(1);
  }

  const client = createClient({ baseUrl: BASE_URL });
  const authRes = await client.auth.apiKeyToken({ api_key: USER_API_KEY });
  if (authRes.error) {
    console.error("Auth failed:", authRes.error.message);
    process.exit(1);
  }

  const createRes = await client.agents.create({
    name: "shroud-llm-example-agent",
    description: "Created by examples/shroud-llm setup (Shroud + optional LLM billing path)",
    shroud_enabled: true,
    scopes: ["vault.read"],
  });

  if (createRes.error || !createRes.data) {
    console.error("Create agent failed:", createRes.error?.message ?? "no data");
    process.exit(1);
  }

  const { agent, api_key } = createRes.data;
  if (!api_key) {
    console.error("Agent created but no API key returned.");
    process.exit(1);
  }

  console.log("Agent created (Shroud enabled):");
  console.log("  ID:", agent.id);
  console.log("  API key:", api_key.slice(0, 12) + "...");
  console.log("");
  console.log("Next: enable LLM Token Billing for this org if you have not already:");
  console.log("  https://1claw.co/settings/billing → LLM Token Billing → Enable");
  console.log("");

  let envContent: string;
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf-8");
    envContent = envContent.replace(/^ONECLAW_AGENT_ID=.*/m, `ONECLAW_AGENT_ID=${agent.id}`);
    envContent = envContent.replace(/^ONECLAW_AGENT_API_KEY=.*/m, `ONECLAW_AGENT_API_KEY=${api_key}`);
  } else {
    envContent = readFileSync(join(packageRoot, ".env.example"), "utf-8");
    envContent = envContent.replace(/^ONECLAW_AGENT_ID=.*/m, `ONECLAW_AGENT_ID=${agent.id}`);
    envContent = envContent.replace(/^ONECLAW_AGENT_API_KEY=.*/m, `ONECLAW_AGENT_API_KEY=${api_key}`);
  }
  writeFileSync(envPath, envContent);
  console.log("Updated .env with ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
