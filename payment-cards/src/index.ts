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

import { createClient } from "@1claw/sdk";

type SdkError = { status: number; detail?: string };

const BASE_URL = (process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz").replace(/\/$/, "");
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
  await human.auth.apiKeyToken({ api_key: USER_KEY });
  ok("Authenticated with human API key");

  // 1. Create (or reuse) a card-enabled agent with ordering guardrails.
  console.log("\n── 1. Card-enabled agent + guardrails ──");
  let agentId = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  if (!agentId) {
    const { data } = await human.agents.create({
      name: `card-demo-${Date.now()}`,
      description: "Payment Card Vault example",
      cards_enabled: true,
      card_max_order_usd: "100",
      card_daily_limit_usd: "250",
    });
    agentId = data.agent.id;
    ok(`Created agent ${agentId} (cards_enabled, max $100/order, $250/day)`);
  } else {
    await human.agents.update(agentId, {
      cards_enabled: true,
      card_max_order_usd: "100",
      card_daily_limit_usd: "250",
    });
    ok(`Reusing agent ${agentId}, ensured card ordering enabled`);
  }

  // 2. Ensure the agent has an Ethereum signing key (the x402 payer).
  console.log("\n── 2. Agent Ethereum signing key (x402 payer) ──");
  let ethAddress: string | undefined;
  try {
    const { data } = await human.signingKeys.create(agentId, { chain: "ethereum" });
    ethAddress = data.address;
    ok(`Provisioned Ethereum signing key: ${ethAddress}`);
  } catch (err) {
    const e = asSdkError(err);
    if (e?.status === 409) {
      const { data } = await human.signingKeys.list(agentId);
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
    const { data: card } = await orderClient.cards.order(agentId, {
      kind: "prepaid",
      amount_usd: ORDER_AMOUNT,
    });
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
      const { data: card } = await human.cards.get(orderedCardId);
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
  const { data: list } = await human.cards.list();
  ok(`${list.cards.length} card(s) for this account`);
  for (const c of list.cards.slice(0, 5)) {
    note(`${c.kind} ${c.brand ?? ""} ····${c.last4 ?? "????"} — ${c.status}`);
  }

  // 6. Reveal with human re-authentication (optional).
  console.log("\n── 6. Reveal (human re-auth) ──");
  if (orderedCardId && REVEAL_PASSWORD) {
    try {
      const { data } = await human.cards.reveal(orderedCardId, { password: REVEAL_PASSWORD });
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
