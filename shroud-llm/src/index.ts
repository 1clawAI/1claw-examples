/**
 * Shroud LLM + Stripe AI Gateway path — for orgs with LLM Token Billing enabled.
 *
 * 1. Exchanges agent API key for JWT and decodes llm_token_billing / stripe_customer_id.
 * 2. Optionally verifies org setting via user API key + GET /v1/billing/llm-token-billing.
 * 3. For each supported provider (OpenAI, Anthropic, Google), sends a minimal request through Shroud.
 *
 * Paths: OpenAI + Google → POST /v1/chat/completions.
 *        Anthropic → POST /v1/messages (native) when billing is off; POST /v1/chat/completions (OpenAI-shaped
 *        body) when billing is on so Stripe AI Gateway can route Claude (native /v1/messages models differ).
 */
import "./load-env.js";

const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.co").trim().replace(
  /\/$/,
  "",
);
const API_URL = (process.env.ONECLAW_BASE_URL || "https://api.1claw.co").trim().replace(/\/$/, "");
const VERBOSE = process.env.SHROUD_LLM_VERBOSE === "1";

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY ?? "").trim();
const GOOGLE_API_KEY = (process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? "").trim();

const USER_API_KEY = (process.env.ONECLAW_API_KEY ?? "").trim();

function getAgentCreds(): { agentId: string; apiKey: string } | null {
  const id = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  const key = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  if (!id || !key || id === "your-agent-uuid" || key.includes("your_")) return null;
  return { agentId: id, apiKey: key };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function exchangeAgentJwt(agentId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, api_key: apiKey }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function checkOrgLlmBillingFromUserKey(): Promise<{ enabled: boolean } | null> {
  if (!USER_API_KEY || USER_API_KEY.includes("your_")) return null;
  const auth = await fetch(`${API_URL}/v1/auth/api-key-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: USER_API_KEY }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!auth.ok) return null;
  const { access_token: bearer } = (await auth.json()) as { access_token?: string };
  if (!bearer) return null;
  const res = await fetch(`${API_URL}/v1/billing/llm-token-billing`, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { enabled?: boolean };
  return { enabled: Boolean(data.enabled) };
}

/** OpenAI `choices[].message.content` or Anthropic `content[].text` (gateways may return either). */
function assistantReplyText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const o = data as Record<string, unknown>;

  const choices = o.choices as
    | Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>
    | undefined;
  const msg0 = choices?.[0]?.message;
  const c = msg0?.content;
  if (typeof c === "string" && c.trim()) return c.trim();
  if (Array.isArray(c)) {
    const joined = c
      .map((part) =>
        typeof part === "object" && part && typeof part.text === "string" ? part.text : "",
      )
      .join("");
    if (joined.trim()) return joined.trim();
  }

  const content = o.content as Array<{ type?: string; text?: string }> | undefined;
  if (Array.isArray(content)) {
    const textBlock = content.find((c) => c.type === "text" && typeof c.text === "string");
    if (textBlock?.text) return textBlock.text.trim();
  }

  const candidates = o.candidates as
    | Array<{ content?: { parts?: Array<{ text?: string }> } }>
    | undefined;
  const parts = candidates?.[0]?.content?.parts;
  const geminiText = parts?.map((p) => p.text).filter(Boolean).join("");
  if (geminiText?.trim()) return geminiText.trim();

  return "";
}

type ProviderCase = {
  id: string;
  path: string;
  xShroudProvider: string;
  xShroudModel: string;
  body: Record<string, unknown>;
  /** Env-backed API key when LLM billing is off (X-Shroud-Api-Key) */
  directApiKey: string;
  directKeyName: string;
};

const PROMPT = "Reply with exactly: OK";

/** Direct Gemini uses `contents`. Stripe Anthropic uses chat-completions-shaped JSON, not /v1/messages. */
function buildRequestBody(p: ProviderCase, hasLlmBilling: boolean): Record<string, unknown> {
  if (p.id === "google" && !hasLlmBilling) {
    return {
      contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    };
  }
  if (p.id === "anthropic" && hasLlmBilling) {
    // Stripe gateway allowlist varies; Haiku 3.5 is commonly routed (rewritten to anthropic/… by Shroud).
    return {
      model: "claude-3-5-haiku-20241022",
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: 10,
    };
  }
  if (p.id === "anthropic" && !hasLlmBilling) {
    return {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 10,
      messages: [{ role: "user", content: PROMPT }],
    };
  }
  return p.body;
}

function shroudPath(p: ProviderCase, hasLlmBilling: boolean): string {
  if (p.id === "anthropic" && hasLlmBilling) {
    return "/v1/chat/completions";
  }
  return p.path;
}

const PROVIDERS: ProviderCase[] = [
  {
    id: "openai",
    path: "/v1/chat/completions",
    xShroudProvider: "openai",
    xShroudModel: "gpt-4o-mini",
    body: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: 10,
    },
    directApiKey: OPENAI_API_KEY,
    directKeyName: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    path: "/v1/messages",
    xShroudProvider: "anthropic",
    xShroudModel: "claude-3-5-haiku-20241022",
    body: {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 10,
      messages: [{ role: "user", content: PROMPT }],
    },
    directApiKey: ANTHROPIC_API_KEY,
    directKeyName: "ANTHROPIC_API_KEY",
  },
  {
    id: "google",
    path: "/v1/chat/completions",
    xShroudProvider: "google",
    xShroudModel: "gemini-2.5-flash",
    body: {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: 10,
    },
    directApiKey: GOOGLE_API_KEY,
    directKeyName: "GOOGLE_API_KEY",
  },
];

async function runProvider(
  creds: { agentId: string; apiKey: string },
  hasLlmBilling: boolean,
  p: ProviderCase,
): Promise<"pass" | "fail" | "skip"> {
  const needsKey = !hasLlmBilling && !p.directApiKey;
  if (needsKey) {
    console.log(
      `[SKIP] ${p.id}: set ${p.directKeyName} or enable LLM Token Billing (Stripe supplies keys)`,
    );
    return "skip";
  }

  const headers: Record<string, string> = {
    "X-Shroud-Agent-Key": `${creds.agentId}:${creds.apiKey}`,
    "Content-Type": "application/json",
    "X-Shroud-Provider": p.xShroudProvider,
    "X-Shroud-Model": p.xShroudModel,
  };
  if (!hasLlmBilling && p.directApiKey) {
    headers["X-Shroud-Api-Key"] = p.directApiKey;
  }

  const path = shroudPath(p, hasLlmBilling);
  const body = JSON.stringify(buildRequestBody(p, hasLlmBilling));
  const requestUrl = `${SHROUD_URL}${path}`;

  if (VERBOSE) {
    const headersForLog = { ...headers };
    if (headersForLog["X-Shroud-Agent-Key"]) headersForLog["X-Shroud-Agent-Key"] = "[REDACTED]";
    if (headersForLog["X-Shroud-Api-Key"]) headersForLog["X-Shroud-Api-Key"] = "[REDACTED]";
    console.log(`\n── Shroud ${p.id} ──`);
    console.log("       URL:", requestUrl);
    console.log("       Headers:", JSON.stringify(headersForLog, null, 2));
    console.log("       Body:", body);
  } else {
    console.log(`── Shroud ${p.id} (${path}) ──`);
  }

  const res = await fetch(requestUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(60_000),
  });

  const responseText = await res.text();

  if (VERBOSE) {
    console.log("       Status:", res.status, res.statusText);
    console.log("       Body:", responseText.slice(0, 2500) + (responseText.length > 2500 ? "\n... (truncated)" : ""));
  }

  if (res.status === 200) {
    let data: unknown;
    try {
      data = JSON.parse(responseText) as unknown;
    } catch {
      console.log(`[FAIL] ${p.id}: invalid JSON`);
      return "fail";
    }
    const text = assistantReplyText(data);
    if (VERBOSE) {
      console.log("       Parsed response:", JSON.stringify(data, null, 2).slice(0, 2000));
    }
    if (text.toUpperCase().includes("OK")) {
      console.log(`[OK]   ${p.id} → 200`);
      return "pass";
    }
    console.log(`[FAIL] ${p.id}: unexpected content: ${text.slice(0, 120)}`);
    return "fail";
  }

  if (res.status === 401) {
    if (hasLlmBilling) {
      console.log(
        `[FAIL] ${p.id}: 401 with LLM billing — check Shroud STRIPE_SECRET_KEY / gateway config`,
      );
      return "fail";
    }
    console.log(`[SKIP] ${p.id}: 401 — set ${p.directKeyName} or enable billing`);
    return "skip";
  }

  // Stripe AI Gateway Anthropic allowlist varies by program/account; don’t fail the whole demo.
  if (
    res.status === 400 &&
    p.id === "anthropic" &&
    hasLlmBilling &&
    responseText.toLowerCase().includes("supported model")
  ) {
    console.log(
      "[SKIP] anthropic: Stripe gateway returned unsupported model for this account (allowlist).",
    );
    console.log(
      "       Set ANTHROPIC_API_KEY to test direct Anthropic via POST /v1/messages, or pick a model Stripe lists for your org.",
    );
    if (!VERBOSE) console.log(responseText.slice(0, 400));
    return "skip";
  }

  console.log(`[FAIL] ${p.id}: HTTP ${res.status}`);
  if (!VERBOSE) console.log(responseText.slice(0, 500));
  return "fail";
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  1Claw — Shroud LLM (LLM Token Billing path)");
  console.log("  Providers: OpenAI, Anthropic, Google (Gemini via Stripe when billing on)");
  console.log("═══════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const creds = getAgentCreds();
  if (!creds) {
    console.log("[SKIP] Set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY (run npm run setup)\n");
    process.exit(0);
  }

  const orgBilling = await checkOrgLlmBillingFromUserKey();
  if (orgBilling !== null) {
    console.log("── Org LLM Token Billing (user API key) ──");
    if (orgBilling.enabled) {
      console.log("[OK]   GET /v1/billing/llm-token-billing → enabled: true");
      passed++;
    } else {
      console.log(
        "[WARN] Org LLM Token Billing is not enabled. Enable at Settings → Billing, then re-run.",
      );
      console.log("       Agent JWT may still lack llm_token_billing until billing is active.\n");
    }
  } else {
    console.log("── Org LLM billing (optional) ──");
    console.log("[SKIP] Set ONECLAW_API_KEY in .env to verify org billing status via API\n");
  }

  console.log("── Agent JWT claims ──");
  const jwt = await exchangeAgentJwt(creds.agentId, creds.apiKey);
  if (!jwt) {
    console.log("[FAIL] Agent token exchange failed");
    process.exit(1);
  }
  const payload = decodeJwtPayload(jwt);
  if (!payload) {
    console.log("[FAIL] Could not decode agent JWT payload");
    process.exit(1);
  }

  const llmBill = payload["llm_token_billing"];
  const stripeCust = payload["stripe_customer_id"];
  console.log("       llm_token_billing:", llmBill);
  console.log("       stripe_customer_id:", stripeCust ?? "(none)");

  const hasLlmBilling: boolean =
    llmBill === true && typeof stripeCust === "string" && stripeCust.length > 0;

  if (hasLlmBilling) {
    console.log("[OK]   Agent JWT includes LLM billing claims (Stripe AI Gateway path eligible)\n");
    passed++;
    console.log(
      "── Provider checks (billing on → no X-Shroud-Api-Key; Stripe routes by model prefix) ──",
    );
  } else {
    console.log(
      "[SKIP] Agent JWT missing LLM billing — direct provider keys required per provider.\n",
    );
    skipped++;
    console.log(
      "── Provider checks (billing off → set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY as needed) ──",
    );
  }

  for (const p of PROVIDERS) {
    const r = await runProvider(creds, hasLlmBilling, p);
    if (r === "pass") passed++;
    else if (r === "fail") failed++;
    else skipped++;
    console.log("");
  }

  console.log("═══════════════════════════════════════════════════");
  console.log(`  Done: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
