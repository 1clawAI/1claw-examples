# Shroud router keys — a stock OpenAI SDK through the enclave

> **Reference only.** Shows the static-Bearer path a Shroud AI customer uses: mint an `sk-shroud-v1-…` router key, point the unmodified `openai` SDK at the gateway, stream a completion that is inspected frame by frame inside the TEE, revoke.

## What it does

| Step | Call |
|------|------|
| Mint a router key | `POST /v1/agents/{id}/router-keys` (`client.agents.createRouterKey`) — plaintext returned once, with `base_url` |
| Use it | `new OpenAI({ apiKey: "sk-shroud-v1-…", baseURL: "https://shroud.1claw.co/v1" })` + `X-Shroud-Provider` |
| Stream | `stream: true` — text deltas released behind a tail sized to the org's longest vault secret; tool-call deltas held until complete; `[DONE]` terminated |
| Revoke | `DELETE /v1/agents/{id}/router-keys/{key_id}` — the gateway refuses the key within 60 s |

Router-key traffic is paid from the org's prepaid ledger: **$0.005 per inspected request**, debited before anything is forwarded. With an empty ledger the completion answers **402 `insufficient_credits`** — the example prints that and still revokes the key. Top up with `POST /v1/billing/credits/topup` (card, $5 minimum) or send `Authorization: Bearer x402` for the wallet rail.

## Run

```bash
cp .env.example .env   # ONECLAW_API_KEY (1ck_), ONECLAW_AGENT_ID (Shroud-enabled), optional OPENAI_API_KEY
npm install
npm start
```

The agent must have `shroud_enabled: true`. Without your own `OPENAI_API_KEY`, the gateway uses the key stored in the agent's vault at `providers/openai/api-key`.

Docs: [Shroud — Auth](https://docs.1claw.co/docs/agents/shroud/overview#auth), [Streaming](https://docs.1claw.co/docs/agents/shroud/overview#streaming), [Paying for inspection](https://docs.1claw.co/docs/agents/shroud/overview#inspection-fee).
