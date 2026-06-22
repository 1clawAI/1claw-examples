/**
 * Sign one minimal transaction (sign-only, no broadcast).
 * Tries Vault API first (resolves key from vaults the agent can access), then Shroud.
 * Returns signed_tx hex + tx_hash so you can broadcast via your own RPC.
 * Requires: agent with intents_api_enabled, signing key at keys/base-signer, policy on keys/**.
 */
import "./load-env.js";

const API_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.xyz").trim().replace(/\/$/, "");
const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.xyz").trim().replace(/\/$/, "");

function getAgentCreds(): { agentId: string; apiKey: string } | null {
  const id = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  const key = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  if (!id || !key || id === "your-agent-uuid" || key.startsWith("ocv_your_")) return null;
  return { agentId: id, apiKey: key };
}

async function getAgentToken(creds: { agentId: string; apiKey: string }): Promise<string> {
  const res = await fetch(`${API_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: creds.agentId, api_key: creds.apiKey }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Agent token failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access_token in agent-token response");
  return data.access_token;
}

async function main() {
  const creds = getAgentCreds();
  if (!creds) {
    console.error("Set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY in .env");
    process.exit(1);
  }

  const payload = {
    chain: "base",
    to: "0x000000000000000000000000000000000000dEaD",
    value: "0",
    data: "0x",
    signing_key_path: "keys/base-signer",
  };

  // Prefer Vault API (resolves key from agent's vault access); fallback to Shroud
  const token = await getAgentToken(creds);
  console.log("Signing transaction (sign-only, no broadcast) via Vault API...\n");
  let res = await fetch(`${API_URL}/v1/agents/${creds.agentId}/transactions/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok && res.status === 500) {
    console.log("Vault API returned 500, trying Shroud...\n");
    res = await fetch(`${SHROUD_URL}/v1/agents/${creds.agentId}/transactions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shroud-Agent-Key": `${creds.agentId}:${creds.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  }

  const text = await res.text();
  if (!res.ok) {
    console.error("Request failed:", res.status, text.slice(0, 400));
    if (res.status === 401) {
      console.error("\nTip: Shroud must be able to reach the Vault to exchange the agent key.");
    }
    if (res.status === 403) {
      console.error("\nTip: Agent needs a signing key in the vault at keys/base-signer and a read policy on keys/**.");
    }
    process.exit(1);
  }

  const data = JSON.parse(text) as {
    signed_tx?: string;
    tx_hash?: string;
    from?: string;
    to?: string;
    chain?: string;
    chain_id?: number;
    nonce?: number;
    value_wei?: string;
    status?: string;
  };

  console.log("Response:");
  console.log("  status:   ", data.status);
  console.log("  from:     ", data.from);
  console.log("  to:       ", data.to);
  console.log("  chain:    ", data.chain, `(${data.chain_id})`);
  console.log("  nonce:    ", data.nonce);
  console.log("  value_wei:", data.value_wei);
  console.log("  tx_hash:  ", data.tx_hash);
  console.log("  signed_tx:", data.signed_tx ? `${data.signed_tx.slice(0, 20)}...` : "(none)");
  console.log("");
  console.log("Full signed_tx (hex):");
  console.log(data.signed_tx);
  console.log("");
  console.log("You can broadcast this via your own RPC, e.g.:");
  console.log('  curl -X POST -H "Content-Type: application/json" \\');
  console.log('    -d \'{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["' + (data.signed_tx ?? "") + '"],"id":1}\' \\');
  console.log("    <YOUR_RPC_URL>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
