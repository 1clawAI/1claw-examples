/**
 * Shroud LLM proxy: send a minimal chat request to Shroud.
 * API key can come from (1) Vault at providers/openai/api-key, or
 * (2) X-Shroud-Api-Key header (e.g. from OPENAI_API_KEY env).
 * Reads ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY from .env.
 */
import { fileURLToPath } from "node:url";
import "./load-env.js";

const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.co").trim().replace(
  /\/$/,
  ""
);
const API_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.co").trim().replace(/\/$/, "");
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();

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

export async function runLlmProxyCheck(): Promise<{ passed: number; failed: number; skipped: number }> {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  console.log("── Shroud LLM proxy (OpenAI) ──");

  const token = await getAgentToken();
  if (!token) {
    console.log("[SKIP] Set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY in .env — LLM proxy test skipped");
    skipped++;
    return { passed, failed, skipped };
  }

  const creds = getAgentCreds()!;

  // Shroud expects X-Shroud-Agent-Key (agent_id:api_key), not Bearer JWT
  const headers: Record<string, string> = {
    "X-Shroud-Agent-Key": `${creds.agentId}:${creds.apiKey}`,
    "Content-Type": "application/json",
    "X-Shroud-Provider": "openai",
    "X-Shroud-Model": "gpt-4o-mini",
  };
  if (OPENAI_API_KEY) {
    headers["X-Shroud-Api-Key"] = OPENAI_API_KEY;
  }

  const body = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    max_tokens: 10,
  });

  const res = await fetch(`${SHROUD_URL}/v1/chat/completions`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 200) {
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (content.toUpperCase().includes("OK")) {
      console.log("[OK]   POST /v1/chat/completions (OpenAI via Shroud) → 200");
      passed++;
    } else {
      console.log("[FAIL] Unexpected reply:", content.slice(0, 60));
      failed++;
    }
  } else if (res.status === 401) {
    console.log(
      "[SKIP] 401 — Store OpenAI key in Vault at providers/openai/api-key (agent read) or set OPENAI_API_KEY"
    );
    skipped++;
  } else {
    const text = await res.text();
    console.log("[FAIL] POST /v1/chat/completions →", res.status, text.slice(0, 80));
    failed++;
  }

  return { passed, failed, skipped };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runLlmProxyCheck()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
