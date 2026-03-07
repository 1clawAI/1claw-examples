import "dotenv/config";
import { testUnicode } from "./test-unicode.js";
import { testInjection } from "./test-injection.js";
import { testSocial } from "./test-social.js";
import { testEncoding } from "./test-encoding.js";
import { testNetwork } from "./test-network.js";
import { testFilesystem } from "./test-filesystem.js";

async function main() {
  console.log("── Shroud Security Filter Tests ──\n");

  const shroudUrl = process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.xyz";
  const apiUrl = process.env.ONECLAW_API_URL || "https://api.1claw.xyz";
  const agentId = process.env.ONECLAW_AGENT_ID;
  const agentApiKey = process.env.ONECLAW_AGENT_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!agentId || !agentApiKey) {
    console.error("Error: ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY required.");
    console.error("Run `npm run setup` first to create an agent.");
    process.exit(1);
  }

  if (!openaiKey) {
    console.warn("Warning: OPENAI_API_KEY not set. LLM proxy tests will be simulated.\n");
  }

  const token = await getAgentToken(apiUrl, agentId, agentApiKey);

  await testUnicode(shroudUrl, token, openaiKey);
  await testInjection(shroudUrl, token, openaiKey);
  await testSocial(shroudUrl, token, openaiKey);
  await testEncoding(shroudUrl, token, openaiKey);
  await testNetwork(shroudUrl, token, openaiKey);
  await testFilesystem(shroudUrl, token, openaiKey);

  console.log("\n── All tests complete ──");
}

async function getAgentToken(
  apiUrl: string,
  agentId: string,
  apiKey: string
): Promise<string> {
  const resp = await fetch(`${apiUrl}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, api_key: apiKey }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to get agent token: ${resp.status}`);
  }

  const data = await resp.json();
  return data.access_token;
}

main().catch(console.error);
