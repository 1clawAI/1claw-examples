/**
 * Bankr Dynamic Key Vending — SDK walkthrough
 *
 * Covers: deny-by-default, policy grant on __agent-keys, agent vs human lease,
 * list/revoke, and optional Shroud routing (X-Shroud-Provider: bankr).
 */

import { createClient } from "@1claw/sdk";

type SdkError = { status: number; detail?: string };

const BASE_URL = (process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co").replace(
  /\/$/,
  "",
);
const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL ?? "https://shroud.1claw.co").replace(
  /\/$/,
  "",
);
const USER_KEY = process.env.ONECLAW_API_KEY?.trim();
const SHROUD_PROBE = /^(1|true|yes)$/i.test(process.env.BANKR_SHROUD_PROBE ?? "");

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function note(msg: string) {
  console.log(`  · ${msg}`);
}

function skip(msg: string) {
  console.log(`  ○ ${msg}`);
}

function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

function asSdkError(err: unknown): SdkError | null {
  if (typeof err !== "object" || err === null || !("status" in err)) return null;
  const e = err as SdkError;
  return typeof e.status === "number" ? e : null;
}

function isNotConfigured(err: unknown): boolean {
  const e = asSdkError(err);
  return (
    e?.status === 400 &&
    (e.detail?.toLowerCase().includes("not configured") ?? false)
  );
}

async function exchangeAgentJwt(agentId: string, apiKey: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, api_key: apiKey }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text();
    fail(`agent token exchange → ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) fail("agent token exchange returned no access_token");
  return data.access_token;
}

async function probeShroudBankr(agentJwt: string): Promise<void> {
  console.log("\n── Optional: Shroud + Bankr provider ──");
  const res = await fetch(`${SHROUD_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agentJwt}`,
      "Content-Type": "application/json",
      "X-Shroud-Provider": "bankr",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with exactly: bankr-ok" }],
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    skip(`Shroud probe → ${res.status} (check shroud_enabled / leased key)`);
    return;
  }
  if (res.ok) {
    ok(`Shroud Bankr chat → ${res.status}`);
    note(text.slice(0, 120));
    return;
  }
  skip(`Shroud probe → ${res.status}: ${text.slice(0, 120)}`);
}

async function main() {
  if (!USER_KEY || USER_KEY.includes("your_")) {
    console.error("Set ONECLAW_API_KEY=1ck_... in .env");
    process.exit(1);
  }
  if (!USER_KEY.startsWith("1ck_")) {
    console.error("ONECLAW_API_KEY must be a human key (1ck_…).");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  1Claw — Bankr Dynamic Key Vending                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const human = createClient({ baseUrl: BASE_URL, apiKey: USER_KEY });
  await human.auth.apiKeyToken({ api_key: USER_KEY });
  ok("Authenticated with human API key");

  let agentId = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  let agentApiKey = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  let createdAgent = false;
  let bankrPolicyId: string | undefined;
  const leaseIds: string[] = [];

  if (!agentId || !agentApiKey || agentApiKey.includes("your_")) {
    console.log("\n── Bootstrap demo agent (shroud_enabled) ──");
    const created = await human.agents.create({
      name: `bankr-demo-${Date.now()}`,
      description: "Bankr key vending example (ephemeral)",
      shroud_enabled: true,
    });
    agentId = created.data.agent.id;
    agentApiKey = created.data.api_key ?? "";
    createdAgent = true;
    if (!agentApiKey) fail("create agent did not return api_key");
    ok(`Created agent ${agentId}`);
  } else {
    ok(`Using agent ${agentId}`);
  }

  console.log("\n── Human: list active Bankr leases ──");
  const listed = await human.agents.listBankrKeys(agentId);
  ok(`listBankrKeys → ${listed.data.leases?.length ?? 0} active lease(s)`);

  console.log("\n── Agent: deny-by-default (no bankr/* policy) ──");
  const agentClient = createClient({
    baseUrl: BASE_URL,
    apiKey: agentApiKey,
    agentId,
  });
  try {
    await agentClient.agents.leaseBankrKey(agentId, { ttl_seconds: 600 });
    fail("expected 403 without bankr policy");
  } catch (err: unknown) {
    if (asSdkError(err)?.status === 403) {
      ok("Agent lease without policy → 403");
    } else {
      throw err;
    }
  }

  console.log("\n── Human: grant least-privilege policy on __agent-keys ──");
  const akv = await human.org.getAgentKeysVault();
  const vaultId = akv.data.vault_id;
  if (!vaultId) fail("org has no __agent-keys vault yet");
  const policy = await human.access.grantAgent(vaultId, agentId, ["write"], {
    secretPathPattern: `agents/${agentId}/bankr/*`,
  });
  bankrPolicyId = policy.data.id;
  ok(`Policy ${bankrPolicyId} on agents/${agentId}/bankr/*`);

  await agentClient.auth.agentToken({ agent_id: agentId, api_key: agentApiKey });
  ok("Re-exchanged agent JWT (scopes include bankr path)");

  console.log("\n── Agent: lease short-lived key (metadata only) ──");
  let agentLeaseOk = false;
  let agentJwtForShroud: string | undefined;
  try {
    const lease = await agentClient.agents.leaseBankrKey(agentId, {
      ttl_seconds: 600,
      permissions: {
        llm_gateway_enabled: true,
        agent_api_enabled: false,
        read_only: true,
      },
    });
    if (lease.data.api_key) {
      fail("agent lease must not include api_key (use Shroud for LLM traffic)");
    }
    leaseIds.push(lease.data.lease_id);
    agentLeaseOk = true;
    ok(`Agent lease → ${lease.data.lease_id} (expires ${lease.data.expires_at})`);
    note("api_key omitted from agent response — key stored for Shroud resolution");
    agentJwtForShroud = await exchangeAgentJwt(agentId, agentApiKey);
  } catch (err) {
    if (isNotConfigured(err)) {
      skip("BANKR_PARTNER_KEY not configured on Vault — skipping live lease");
    } else {
      throw err;
    }
  }

  console.log("\n── Human: lease (may include bk_usr_ once) ──");
  try {
    const humanLease = await human.agents.leaseBankrKey(agentId, { ttl_seconds: 900 });
    leaseIds.push(humanLease.data.lease_id);
    ok(`Human lease → ${humanLease.data.lease_id}`);
    if (humanLease.data.api_key?.startsWith("bk_usr_")) {
      ok("Human response includes bk_usr_ (treat as secret — do not log)");
    } else if (agentLeaseOk) {
      note("Human lease metadata without api_key in this environment");
    }
  } catch (err) {
    if (isNotConfigured(err)) {
      skip("Human lease skipped (vending not configured)");
    } else {
      throw err;
    }
  }

  if (leaseIds.length) {
    console.log("\n── Revoke leases (revoke-after-task pattern) ──");
    for (const id of [...new Set(leaseIds)]) {
      await human.agents.revokeBankrKey(agentId, id);
      ok(`revokeBankrKey ${id} → 204`);
    }
  }

  if (SHROUD_PROBE && agentLeaseOk && agentJwtForShroud) {
    await probeShroudBankr(agentJwtForShroud);
  } else if (SHROUD_PROBE) {
    skip("Shroud probe skipped (no successful agent lease)");
  } else {
    note("Set BANKR_SHROUD_PROBE=1 to try Shroud with X-Shroud-Provider: bankr");
  }

  console.log("\n── Cleanup ──");
  if (bankrPolicyId) {
    await human.access.revoke(vaultId, bankrPolicyId);
    ok("Revoked bankr policy");
  }
  if (createdAgent) {
    await human.agents.delete(agentId);
    ok(`Deleted demo agent ${agentId}`);
  }

  console.log("\nDone. See docs/docs/guides/bankr-key-vending.md for approval-gated access and TTL guidance.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
