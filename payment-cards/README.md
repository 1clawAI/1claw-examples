# Payment Card Vault

Demonstrates the [Payment Card Vault](https://docs.1claw.co/guides/payment-cards) end to end:

1. **Card-enabled agent** — create an agent with ordering guardrails (`cards_enabled`, `card_max_order_usd`, `card_daily_limit_usd`)
2. **Ethereum signing key** — the x402 payer; fund its Base address with USDC
3. **Order** — order a prepaid card via x402 (server-side payment + EIP-3009 signing); no PAN is ever returned
4. **Poll to ready** — the `card_monitor` fills `last4`, expiry, and balance
5. **List** — always masked to `last4`
6. **Reveal** — human password re-authentication (`X-Auth-Confirm`), audit-logged, with the post-reveal disclaimer

The example degrades gracefully: without a funded Base USDC balance and a configured Laso deployment, the order step reports the block (402/400) instead of failing, so the guardrail wiring still validates.

## Prerequisites

- A 1Claw user API key (`1ck_`) from **Settings → API Keys** on a **Pro+** plan (card ordering is tier-gated)
- To actually complete an order: the agent's Base signing-key address must hold USDC, and the Vault deployment must be configured for Laso (`LASO_PAYTO_ALLOWLIST`, optional `LASO_BASE_URL`)

## Run

```bash
cd examples/payment-cards
cp .env.example .env    # fill in ONECLAW_API_KEY
npm install
npm start
```

## Environment

| Var | Required | Description |
| --- | --- | --- |
| `ONECLAW_API_KEY` | yes | Human key (`1ck_…`) |
| `ONECLAW_BASE_URL` | no | Defaults to `https://api.1claw.co` |
| `ONECLAW_AGENT_ID` | no | Reuse an existing agent instead of creating one |
| `ONECLAW_AGENT_API_KEY` | no | If set, the order is placed as the agent (else as the human owner) |
| `ONECLAW_ACCOUNT_PASSWORD` | no | Enables the reveal step (password re-auth) |
| `CARD_ORDER_AMOUNT` | no | Order amount in USD (default `5.00`) |
