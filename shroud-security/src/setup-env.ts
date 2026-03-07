import { createClient } from "@1claw/sdk";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

async function main() {
  const apiKey = process.env.ONECLAW_API_KEY;
  const baseUrl = process.env.ONECLAW_API_URL || "https://api.1claw.xyz";

  if (!apiKey) {
    console.error("Error: ONECLAW_API_KEY not set in .env");
    console.error("Get your API key from https://1claw.xyz/settings/api-keys");
    process.exit(1);
  }

  console.log("Creating agent with threat detection config...\n");

  const client = createClient({ baseUrl, apiKey });

  const { data, error } = await client.agents.create({
    name: `shroud-security-demo-${Date.now()}`,
    description: "Demo agent for testing Shroud threat detection",
    shroud_enabled: true,
    shroud_config: {
      pii_policy: "redact",
      injection_threshold: 0.7,
      enable_secret_redaction: true,
      enable_response_filtering: true,
      unicode_normalization: {
        enabled: true,
        strip_zero_width: true,
        normalize_homoglyphs: true,
        normalization_form: "NFKC",
      },
      command_injection_detection: {
        action: "warn",
        strictness: "default",
      },
      social_engineering_detection: {
        action: "warn",
        sensitivity: "medium",
      },
      encoding_detection: {
        action: "warn",
        detect_base64: true,
        detect_hex: true,
        detect_unicode: true,
      },
      network_detection: {
        action: "warn",
        blocked_domains: ["pastebin.com", "ngrok.io", "requestbin.com"],
      },
      filesystem_detection: {
        action: "log",
      },
      sanitization_mode: "warn",
      threat_logging: true,
    },
  });

  if (error || !data) {
    console.error("Failed to create agent:", error);
    process.exit(1);
  }

  const agentId = data.agent.id;
  const agentApiKey = data.api_key;

  console.log(`Agent created: ${agentId}`);
  console.log(`API Key: ${agentApiKey?.slice(0, 12)}...`);

  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  const setEnv = (key: string, value: string) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  };

  setEnv("ONECLAW_AGENT_ID", agentId);
  setEnv("ONECLAW_AGENT_API_KEY", agentApiKey || "");

  fs.writeFileSync(envPath, envContent.trim() + "\n");

  console.log("\nUpdated .env with agent credentials.");
  console.log("Run `npm start` to test threat detection filters.");
}

main().catch(console.error);
