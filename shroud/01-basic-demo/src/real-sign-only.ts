/**
 * Sign-only via Shroud (no broadcast). Returns signed_tx for your own RPC.
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
  const payload = {
    chain: "base",
    to: "0x000000000000000000000000000000000000dEaD",
    value: "0",
    data: "0x",
    signing_key_path: "keys/base-signer",
  };

  console.log("Sign-only via Shroud (Base, 0 value, burn address)...\n");
  const res = await fetch(`${SHROUD_URL}/v1/agents/${creds.agentId}/transactions/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Request failed:", res.status, text.slice(0, 400));
    if (res.status === 403) {
      console.error("\nTip: run npm run setup-signing to store keys/base-signer and grant read on keys/**.");
    }
    process.exit(1);
  }

  const data = JSON.parse(text) as { status?: string; signed_tx?: string; tx_hash?: string };
  console.log(JSON.stringify(data, null, 2));
  console.log("\nBroadcast signed_tx with your own RPC if desired.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
