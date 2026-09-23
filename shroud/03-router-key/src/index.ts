/**
 * Shroud router keys — a stock OpenAI SDK talking to the Shroud gateway.
 *
 * 1. Mint an `sk-shroud-v1-…` router key for a Shroud-enabled agent (human key).
 * 2. Point the unmodified `openai` SDK at the gateway with that key.
 * 3. Stream a completion: every frame is inspected inside the enclave before
 *    it reaches this process (`x-shroud-stream-inspection: per-frame`).
 * 4. Revoke the key; the gateway refuses it within 60 s.
 *
 * Router-key traffic is paid from the org's prepaid ledger ($0.005 per
 * inspected request). With an empty ledger the completion answers 402
 * `insufficient_credits` — top up at `POST /v1/billing/credits/topup` (card)
 * or send `Authorization: Bearer x402` (wallet).
 */
import { createClient } from "@1claw/sdk";
import OpenAI from "openai";

const API_URL = process.env.ONECLAW_API_URL ?? "https://api.1claw.co";
const HUMAN_KEY = (process.env.ONECLAW_API_KEY ?? "").trim();
const AGENT_ID = (process.env.ONECLAW_AGENT_ID ?? "").trim();
const BYOK = (process.env.OPENAI_API_KEY ?? "").trim();

async function main(): Promise<void> {
  if (!HUMAN_KEY || !AGENT_ID) {
    console.log("[SKIP] Set ONECLAW_API_KEY (1ck_) and ONECLAW_AGENT_ID in .env");
    return;
  }
  // Exchange the human key for a session token explicitly (no fire-and-forget auth).
  const auth = await createClient({ baseUrl: API_URL }).auth.apiKeyToken({ api_key: HUMAN_KEY });
  if (auth.error || !auth.data?.access_token) {
    throw new Error(`auth failed: ${auth.error?.message ?? "no token"}`);
  }
  const oneclaw = createClient({ baseUrl: API_URL, token: auth.data.access_token });

  // 1. Mint. The plaintext comes back once.
  const minted = await oneclaw.agents.createRouterKey(AGENT_ID, {
    name: "example",
    max_concurrent_streams: 5,
  });
  if (minted.error || !minted.data) {
    throw new Error(`mint failed: ${minted.error?.message ?? "no data"}`);
  }
  const routerKey = minted.data.router_key;
  const baseURL = `${minted.data.base_url}/v1`;
  console.log(`Router key ${minted.data.key_prefix}… minted; base_url ${baseURL}`);

  try {
    // 2. Unmodified OpenAI SDK.
    const openai = new OpenAI({
      apiKey: routerKey,
      baseURL,
      defaultHeaders: {
        "X-Shroud-Provider": "openai",
        ...(BYOK ? { "X-Shroud-Api-Key": BYOK } : {}),
      },
    });

    // 3. Stream. Text deltas are released behind a tail sized to your org's
    //    longest vault secret; tool-call deltas are held until complete.
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 32,
      stream: true,
      messages: [{ role: "user", content: "Count from one to five in words." }],
    });
    let text = "";
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content ?? "";
    }
    console.log(`Streamed: ${text.trim()}`);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 402) {
      console.log("[402] The org ledger cannot cover the $0.005 inspection fee — top up credits first.");
    } else {
      throw err;
    }
  } finally {
    // 4. Revoke. Idempotent; the gateway's cache expires within 60 s.
    await oneclaw.agents.revokeRouterKey(AGENT_ID, minted.data.id);
    console.log("Router key revoked");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
