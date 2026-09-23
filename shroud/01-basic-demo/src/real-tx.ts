/**
 * Submit one minimal real transaction via Shroud (0 value, Base mainnet, to burn address).
 * Requires: agent with intents_api_enabled, signing key in vault at keys/base-signer,
 * and a policy granting the agent read on keys/**.
 * Shroud must be able to reach the Vault to exchange the agent key.
 */
import "./load-env.js";

const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.co").trim().replace(/\/$/, "");

function getAgentCreds(): { agentId: string; apiKey: string } | null {
  const id = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  const key = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  if (!id || !key || id === "your-agent-uuid" || key.startsWith("ocv_your_")) return null;
  return { agentId: id, apiKey: key };
}

async function main() {
  const creds = getAgentCreds();
  if (!creds) {
    console.error("Set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY in .env");
    process.exit(1);
  }

  const authHeader = { "X-Shroud-Agent-Key": `${creds.agentId}:${creds.apiKey}` };

  // Minimal real tx: 0 value to burn address on Base mainnet (no funds at risk)
  const payload = {
    chain: "base",
    to: "0x000000000000000000000000000000000000dEaD",
    value: "0",
    data: "0x",
    signing_key_path: "keys/base-signer",
  };

  console.log("Submitting real transaction via Shroud (Base mainnet, 0 value, burn address)...\n");
  const res = await fetch(`${SHROUD_URL}/v1/agents/${creds.agentId}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Request failed:", res.status, text.slice(0, 400));
    if (res.status === 401) {
      console.error("\nTip: Shroud must be able to reach the Vault to exchange the agent key. Check Shroud deployment / network.");
    }
    if (res.status === 403) {
      console.error("\nTip: Agent needs a signing key in the vault at keys/base-signer and a read policy on keys/**.");
    }
    process.exit(1);
  }

  const data = JSON.parse(text) as { transaction_id?: string; status?: string; signed_tx?: string; tx_hash?: string };
  console.log("Response:", JSON.stringify(data, null, 2));
  console.log("\nReal transaction submitted.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
