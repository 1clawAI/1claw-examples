# Shroud LLM — LLM Token Billing (Stripe AI Gateway)

> **Reference only** — not for production. This example targets organizations that have **LLM Token Billing** enabled in the dashboard (**Settings → Billing**). It verifies agent JWT claims (`llm_token_billing`, `stripe_customer_id`) and sends a minimal chat request through **Shroud** so traffic can be metered via **Stripe AI Gateway** when Shroud is configured with `STRIPE_SECRET_KEY`.

## Quick start

```bash
cd examples/shroud-llm
npm install
cp .env.example .env
# Edit .env: ONECLAW_API_KEY (user key from https://1claw.co/settings/api-keys)
npm run setup   # creates a Shroud-enabled agent; writes ONECLAW_AGENT_ID + ONECLAW_AGENT_API_KEY to .env
# Dashboard: Settings → Billing → enable LLM Token Billing for the org (if you want Stripe-metered path)
npm start       # exchanges agent token, checks JWT claims, hits OpenAI / Anthropic / Google via Shroud
```

From the repo root: `cd examples && npm run bootstrap` copies `.env.example` → `.env` for each example (skipped if `.env` already exists).

## What you'll learn

- Confirm your org has **LLM Token Billing** enabled and your agent JWT includes `llm_token_billing` and `stripe_customer_id`
- Send **OpenAI**, **Anthropic**, and **Google (Gemini)** requests through **Shroud** so traffic can be metered via Stripe AI Gateway when billing is on (no provider keys on the client)
- Use the same Shroud LLM entrypoints as [shroud-demo](../shroud-demo/) but with a focus on billing claims and multi-provider coverage

## Prerequisites

1. **Org:** Same organization as your user API key must have **LLM Token Billing** active (complete Stripe checkout in the dashboard).
2. **Stripe customer:** The org should have a Stripe customer id (created when you first use billing or checkout).
3. **Agent:** An agent with **Shroud** enabled (`shroud_enabled: true`). Use `npm run setup` or create one in the dashboard.
4. **Provider API keys:** **NOT required** when LLM Token Billing is enabled (Stripe AI Gateway handles OpenAI, Anthropic, and Google). If billing is disabled, set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) for each provider you want to test—or store keys in the vault under `providers/{openai|anthropic|google}/api-key`. For **Google without billing**, the script uses Gemini-native JSON (`contents`); with billing it uses OpenAI-shaped `messages` for Stripe’s chat completions path.

## Demo walkthrough (5 min)

### Step 1 — Install and configure

```bash
cd examples/shroud-llm
npm install
cp .env.example .env
```

Edit `.env`: set `ONECLAW_API_KEY` (user key from [1claw.co/settings/api-keys](https://1claw.co/settings/api-keys)). For `npm start` you also need agent credentials: set `ONECLAW_AGENT_ID` and `ONECLAW_AGENT_API_KEY` (or run `npm run setup` to create an agent and have it written to `.env`).

### Step 2 — Create an agent (if needed)

```bash
npm run setup
```

This creates an agent with Shroud enabled and writes `ONECLAW_AGENT_ID` and `ONECLAW_AGENT_API_KEY` to `.env`. In the dashboard, ensure **Settings → Billing → LLM Token Billing** is enabled for your org.

### Step 3 — Run the demo

```bash
npm start
```

**Expected behavior:** The script exchanges agent credentials for a JWT, decodes it for `llm_token_billing` / `stripe_customer_id`, then runs three checks:

| Provider | Shroud path | Body shape (billing on) |
|----------|-------------|-------------------------|
| OpenAI | `POST .../v1/chat/completions` | OpenAI chat (`gpt-4o-mini`) |
| Anthropic | **Billing on:** `POST .../v1/chat/completions` with OpenAI-shaped `messages` + Claude model (rewritten to `anthropic/…` by Shroud). If Stripe returns 400 *supported model*, the script **skips** Anthropic (gateway allowlist varies by account). **Billing off:** `POST .../v1/messages` + native body (`claude-sonnet-4-5-20250929`). |
| Google | `POST .../v1/chat/completions` | OpenAI-style `messages` + `gemini-2.5-flash` (Stripe rewrites model to `google/...`) |

With billing claims, Shroud sets Stripe customer headers server-side. Without billing, each provider needs its key (env or vault). Set `SHROUD_LLM_VERBOSE=1` for full request/response logs.

## What `npm start` does

| Step | Description |
|------|-------------|
| Org check (optional) | If `ONECLAW_API_KEY` is set, `GET /v1/billing/llm-token-billing` confirms the org toggle. |
| Agent JWT | `POST /v1/auth/agent-token` then decode payload for `llm_token_billing` and `stripe_customer_id`. |
| Shroud LLM | Three `POST`s with `X-Shroud-Agent-Key` and `X-Shroud-Provider` / `X-Shroud-Model`. Anthropic uses `/v1/chat/completions` when LLM billing is on (Stripe), else `/v1/messages` to Anthropic directly. |

When claims are present, **Shroud** routes to Stripe's AI Gateway (`llm.stripe.com`) and sets `X-Stripe-Customer-ID` server-side. **Stripe AI Gateway handles provider API keys** for OpenAI, Anthropic, and Google — you do **not** need `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` when LLM billing is enabled. You do not send `X-Stripe-Customer-ID` from the client.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_AGENT_ID` | Yes | Agent UUID |
| `ONECLAW_AGENT_API_KEY` | Yes | Agent key (`ocv_...`) |
| `ONECLAW_API_KEY` | Optional | User API key — org billing check + `npm run setup` |
| `ONECLAW_BASE_URL` | No | Default `https://api.1claw.co` |
| `ONECLAW_SHROUD_URL` | No | Default `https://shroud.1claw.co` |
| `OPENAI_API_KEY` | No | Only if billing disabled (or use vault `providers/openai/api-key`). |
| `ANTHROPIC_API_KEY` | No | Only if billing disabled (or vault `providers/anthropic/api-key`). |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | No | Only if billing disabled (or vault `providers/google/api-key`). |
| `SHROUD_LLM_VERBOSE` | No | Set to `1` to print full request/response bodies per provider. |

## Testing with a dedicated account

Use any org where you have enabled **LLM Token Billing** (e.g. a staging org or your production org). Point `.env` at that org's user API key for setup/verification and an agent that belongs to the same org. There is no separate "demo-only" flag — billing state is entirely from the dashboard + Stripe.

## Exit codes

- **0** — Success, or missing agent credentials (skipped for CI).
- **1** — Agent token exchange failed, JWT decode failed, or any provider call failed (non-401, or 401 when billing is on).

See also **[shroud-demo](../shroud-demo/)** for health, Intents API, and LLM proxy without focusing on billing claims.
