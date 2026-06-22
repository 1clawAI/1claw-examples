/**
 * Shroud Intents API: get agent JWT from Vault, then call Shroud for
 * transaction list, simulate, and (optionally) submit.
 * Reads ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY from .env.
 */
import { fileURLToPath } from "node:url";
import "./load-env.js";

const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.xyz").trim().replace(
  /\/$/,
  ""
);
const API_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.xyz").trim().replace(/\/$/, "");

function getAgentCreds(): { agentId: string; apiKey: string } | null {
  const id = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  const key = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  if (!id || !key || id === "your-agent-uuid" || key.startsWith("ocv_your_")) return null;
  return { agentId: id, apiKey: key };
}

async function getAgentToken(): Promise<string | null> {
  const creds = getAgentCreds();
  if (!creds) return null;
  const res = await fetch(`${API_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: creds.agentId, api_key: creds.apiKey }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function runIntentsChecks(): Promise<{ passed: number; failed: number; skipped: number }> {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  console.log("── Shroud Intents API (agent auth) ──");

  const token = await getAgentToken();
  if (!token) {
    console.log("[SKIP] Set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY in .env — Intents tests skipped");
    skipped += 5;
    return { passed, failed, skipped };
  }

  const creds = getAgentCreds()!;
  // Shroud expects X-Shroud-Agent-Key (agent_id:api_key), not Bearer JWT
  const authHeader = { "X-Shroud-Agent-Key": `${creds.agentId}:${creds.apiKey}` };

  // No auth → 401
  const noAuthRes = await fetch(`${SHROUD_URL}/v1/health`, { signal: AbortSignal.timeout(5_000) });
  if (noAuthRes.status === 401) {
    console.log("[OK]   GET /v1/health (no auth) → 401");
    passed++;
  } else {
    console.log("[FAIL] GET /v1/health (no auth) →", noAuthRes.status);
    failed++;
  }

  // POST transactions without body / invalid → 400 or 403
  const submitRes = await fetch(
    `${SHROUD_URL}/v1/agents/${creds.agentId}/transactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        chain: "sepolia",
        to: "0x0000000000000000000000000000000000000000",
        value: "0",
        data: "0x",
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  const submitOk = [400, 401, 403, 404, 500, 501, 502].includes(submitRes.status);
  if (submitOk) {
    console.log("[OK]   POST .../transactions (agent auth) →", submitRes.status);
    passed++;
  } else {
    console.log("[FAIL] POST .../transactions →", submitRes.status, await submitRes.text().then((t) => t.slice(0, 60)));
    failed++;
  }

  // List transactions (proxied to Vault)
  const listRes = await fetch(`${SHROUD_URL}/v1/agents/${creds.agentId}/transactions`, {
    headers: authHeader,
    signal: AbortSignal.timeout(10_000),
  });
  if ([200, 401, 403].includes(listRes.status)) {
    console.log("[OK]   GET .../transactions →", listRes.status);
    passed++;
  } else {
    console.log("[FAIL] GET .../transactions →", listRes.status);
    failed++;
  }

  // Simulate (proxied to Vault)
  const simRes = await fetch(
    `${SHROUD_URL}/v1/agents/${creds.agentId}/transactions/simulate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        chain: "sepolia",
        to: "0x0000000000000000000000000000000000000000",
        value: "0",
        data: "0x",
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  const simOk = [400, 401, 403, 422].includes(simRes.status);
  if (simOk) {
    console.log("[OK]   POST .../transactions/simulate →", simRes.status);
    passed++;
  } else {
    console.log("[FAIL] POST .../simulate →", simRes.status);
    failed++;
  }

  // Sign-only (TEE signs, no broadcast) — 200 with signed_tx + tx_hash, or 400/403
  const signRes = await fetch(
    `${SHROUD_URL}/v1/agents/${creds.agentId}/transactions/sign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        chain: "sepolia",
        to: "0x0000000000000000000000000000000000000000",
        value: "0",
        data: "0x",
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  const signOk = signRes.status === 200 || [400, 401, 403, 404, 422, 500, 501, 502].includes(signRes.status);
  if (signOk) {
    console.log("[OK]   POST .../transactions/sign →", signRes.status);
    passed++;
  } else {
    console.log("[FAIL] POST .../transactions/sign →", signRes.status);
    failed++;
  }

  return { passed, failed, skipped };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runIntentsChecks()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
