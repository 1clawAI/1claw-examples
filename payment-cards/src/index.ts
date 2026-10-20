/**
 * Payment Card Vault — SDK walkthrough
 *
 * Covers: enabling card ordering on an agent (guardrails), provisioning the
 * agent's Ethereum signing key, ordering a prepaid card via x402, polling to
 * ready, listing (masked), and revealing with human re-authentication.
 *
 * Ordering requires the agent's Base signing-key address to hold USDC and a
 * configured Laso deployment (LASO_PAYTO_ALLOWLIST / LASO_BASE_URL on the
 * Vault). When those aren't present, the example still validates guardrail
 * wiring and degrades gracefully (it reports the block instead of failing).
 */

import { createClient, type OneclawResponse } from "@1claw/sdk";

type SdkError = { status: number; detail?: string };

const BASE_URL = (process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co").replace(/\/$/, "");
const USER_KEY = process.env.ONECLAW_API_KEY?.trim();
const REVEAL_PASSWORD = process.env.ONECLAW_ACCOUNT_PASSWORD?.trim();
const ORDER_AMOUNT = process.env.CARD_ORDER_AMOUNT?.trim() || "5.00";

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

/**
 * The SDK returns `{ data, error, meta }` rather than throwing. Unwrap it and
 * throw `{ status, detail }` on error, so the status checks below can catch it.
 */
async function must<T>(p: Promise<OneclawResponse<T>>, what: string): Promise<T> {
  const r = await p;
  if (r.error) {
    const status = r.meta?.status ?? 0;
    throw Object.assign(new Error(`${what} → ${status}: ${r.error.detail ?? r.error.message}`), {
      status,
      detail: r.error.detail ?? r.error.message,
    });
  }
  return r.data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  console.log("║  1Claw — Payment Card Vault (x402 card ordering)             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const human = createClient({ baseUrl: BASE_URL, apiKey: USER_KEY });
  await must(human.auth.apiKeyToken({ api_key: USER_KEY }), "apiKeyToken");
  ok("Authenticated with human API key");

  // 1. Create (or reuse) a card-enabled agent with ordering guardrails.
  console.log("\n── 1. Card-enabled agent + guardrails ──");
  let agentId = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  if (!agentId) {
    const data = await must(
      human.agents.create({
        name: `card-demo-${Date.now()}`,
        description: "Payment Card Vault example",
        cards_enabled: true,
        card_max_order_usd: "100",
        card_daily_limit_usd: "250",
      }),
      "create agent",
    );
    agentId = data.agent.id;
    ok(`Created agent ${agentId} (cards_enabled, max $100/order, $250/day)`);
  } else {
    await must(
      human.agents.update(agentId, {
        cards_enabled: true,
        card_max_order_usd: "100",
        card_daily_limit_usd: "250",
      }),
      "update agent",
    );
    ok(`Reusing agent ${agentId}, ensured card ordering enabled`);
  }

  // 2. Ensure the agent has an Ethereum signing key (the x402 payer).
  console.log("\n── 2. Agent Ethereum signing key (x402 payer) ──");
  let ethAddress: string | undefined;
  try {
    const data = await must(
      human.signingKeys.create(agentId, { chain: "ethereum" }),
      "create signing key",
    );
    ethAddress = data.address;
    ok(`Provisioned Ethereum signing key: ${ethAddress}`);
  } catch (err) {
    const e = asSdkError(err);
    if (e?.status === 409) {
      const data = await must(human.signingKeys.list(agentId), "list signing keys");
      ethAddress = data.keys?.find((k: any) => k.chain === "ethereum")?.address;
      ok(`Ethereum signing key already present: ${ethAddress ?? "(unknown)"}`);
    } else {
      fail(`signing-key provisioning → ${e?.status ?? "?"}: ${e?.detail ?? String(err)}`);
    }
  }
  if (ethAddress) {
    note(`Fund ${ethAddress} with USDC on Base before ordering can succeed.`);
  }

  // 3. Order a prepaid card via x402 (server-side payment + signing).
  console.log("\n── 3. Order a prepaid card via x402 ──");
  let orderedCardId: string | undefined;
  const agentApiKey = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  const orderClient = agentApiKey
    ? createClient({ baseUrl: BASE_URL, apiKey: agentApiKey })
    : human;
  try {
    const card = await must(
      orderClient.cards.order(agentId, {
        kind: "prepaid",
        amount_usd: ORDER_AMOUNT,
      }),
      "order card",
    );
    orderedCardId = card.id;
    ok(`Ordered card ${card.id} — status: ${card.status} (no PAN returned)`);
  } catch (err) {
    const e = asSdkError(err);
    if (e?.status === 402 || e?.status === 400) {
      skip(`Order not completed → ${e.status}: ${e.detail ?? ""}`);
      note("Expected without a funded Base USDC balance + configured Laso deployment.");
    } else if (e?.status === 403) {
      skip(`Order blocked by guardrails/tier → 403: ${e.detail ?? ""}`);
    } else {
      fail(`order → ${e?.status ?? "?"}: ${e?.detail ?? String(err)}`);
    }
  }

  // 4. Poll to ready (the card_monitor fills last4/expiry/balance).
  if (orderedCardId) {
    console.log("\n── 4. Poll until ready ──");
    for (let i = 0; i < 6; i++) {
      await sleep(10_000);
      const card = await must(human.cards.get(orderedCardId), "get card");
      note(`status: ${card.status}${card.last4 ? `, ····${card.last4}` : ""}`);
      if (card.status === "ready") {
        ok(`Card ready — ····${card.last4}, balance ${card.balance ?? "?"} ${card.currency}`);
        break;
      }
      if (["voided", "expired", "orphaned_payment"].includes(card.status)) {
        skip(`Card ended in status ${card.status}`);
        break;
      }
    }
  }

  // 5. List cards (always masked to last4 — never a PAN).
  console.log("\n── 5. List cards (masked) ──");
  const list = await must(human.cards.list(), "list cards");
  ok(`${list.cards.length} card(s) for this account`);
  for (const c of list.cards.slice(0, 5)) {
    note(`${c.kind} ${c.brand ?? ""} ····${c.last4 ?? "????"} — ${c.status}`);
  }

  // 6. Reveal with human re-authentication (optional).
  console.log("\n── 6. Reveal (human re-auth) ──");
  if (orderedCardId && REVEAL_PASSWORD) {
    try {
      const data = await must(
        human.cards.reveal(orderedCardId, { password: REVEAL_PASSWORD }),
        "reveal card",
      );
      ok(`Revealed card ····${data.pan?.slice(-4) ?? "????"} (full PAN in memory only)`);
      note(data.disclaimer);
    } catch (err) {
      const e = asSdkError(err);
      skip(`Reveal → ${e?.status ?? "?"}: ${e?.detail ?? String(err)}`);
    }
  } else {
    skip("Set ONECLAW_ACCOUNT_PASSWORD and order a card to demo reveal.");
    note("Reveal requires human password re-auth (X-Auth-Confirm) and is audit-logged.");
  }

  console.log("\n✅ Done. Ordering guardrails bound the purchase — not post-reveal spend.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
