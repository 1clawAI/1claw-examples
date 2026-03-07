# Shroud TEE Proxy — Demo & Tests

> **Reference only** — not for production use. Demonstrates and tests [Shroud](https://github.com/1clawAI/shroud) (1Claw’s TEE proxy for the Intents API and LLM traffic).

This example runs scripted checks against Shroud: health endpoints, agent auth, Intents API (transaction list/simulate/submit), and optional LLM proxy.

## What is Shroud?

Shroud runs inside a **Trusted Execution Environment** (AMD SEV-SNP on Confidential GKE). It:

- **Intents API** — Receives transaction signing requests from agents; signs inside the TEE so private keys never leave encrypted memory. Non-submit operations (list, simulate, simulate-bundle) are proxied to the 1Claw Vault API.
- **LLM proxy** — Sits between agents and LLM providers (OpenAI, Anthropic, Google, etc.). It inspects and forwards requests, and can resolve the LLM API key from the 1Claw Vault so agents don’t need to send it.

## Do users need to bring their own LLM API key?

**No.** You have two options:

1. **Store the key in 1Claw** — Put the provider API key in your vault at path `providers/{provider}/api-key` (e.g. `providers/openai/api-key`) and give your agent read access. Shroud fetches it automatically; no key in the request.
2. **Send it per request** — Pass the key in the `X-Shroud-Api-Key` header (e.g. from `OPENAI_API_KEY` in your app). Shroud uses it when the Vault lookup has no key for that agent+provider.

So you can use Shroud for LLM traffic without “bringing” a key in code if it’s already in the Vault.

## What you’ll run

| Step             | What it does                                                                           |
| ---------------- | -------------------------------------------------------------------------------------- |
| Health           | `GET /healthz`, `/health/ready`, `/health/live` (no auth)                              |
| Auth             | `GET /v1/health` without token → 401                                                   |
| Intents API      | Exchange agent id+key for JWT at Vault, then call Shroud: list/simulate/submit         |
| LLM proxy (opt.) | `POST /v1/chat/completions` with `X-Shroud-Provider: openai`; key from Vault or header |

## Prerequisites

- Node.js 20+
- **For health only:** nothing else (no keys).
- **For Intents API:** A [1Claw](https://1claw.xyz) agent with `ONECLAW_AGENT_ID` and `ONECLAW_AGENT_API_KEY` (Intents API enabled if you want real signing).
- **For LLM proxy:** Either store the provider key in the Vault at `providers/openai/api-key` with agent read access, or set `OPENAI_API_KEY` in `.env`.

## Quick start

**Option A — One-time setup (recommended)**  
Put your **user** API key in `.env`, then create an agent and write agent credentials to `.env`:

```bash
cd examples/shroud-demo
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY (your user key from https://1claw.xyz/settings/api-keys)
npm run setup    # creates agent, writes ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY to .env
npm start
```

**Option B — Manual**  
Create an agent in the [1Claw dashboard](https://1claw.xyz) (Agents → Create), copy the agent ID and API key, and set `ONECLAW_AGENT_ID` and `ONECLAW_AGENT_API_KEY` in `.env`. Then run `npm start`.

`npm start` runs all checks (health, Intents, LLM proxy). Individual scripts:

| Command             | Script             | Description                                  |
| ------------------- | ------------------ | -------------------------------------------- |
| `npm run setup`     | `src/setup-env.ts` | Create agent, write agent ID + key to `.env` |
| `npm start`         | `src/index.ts`     | All checks (health + intents + LLM)          |
| `npm run health`    | `src/health.ts`    | Health + readiness only                      |
| `npm run intents`   | `src/intents.ts`   | Agent token + Shroud Intents API             |
| `npm run llm-proxy` | `src/llm-proxy.ts` | One OpenAI request via Shroud (test)         |
| `npm run real-llm`  | `src/real-llm.ts`  | One real LLM query via Shroud → OpenAI       |
| `npm run real-tx`   | `src/real-tx.ts`   | One minimal real tx (0 value, Base)          |

## Environment variables

Only `examples/shroud-demo/.env` is loaded (no sibling or shared env files).

| Variable                | Required        | Description                                               |
| ----------------------- | --------------- | --------------------------------------------------------- |
| `ONECLAW_SHROUD_URL`    | No              | Shroud base URL (default: `https://shroud.1claw.xyz`)     |
| `ONECLAW_API_URL`       | No              | 1Claw Vault API (default: `https://api.1claw.xyz`)        |
| `ONECLAW_AGENT_ID`      | For Intents/LLM | Agent UUID                                                |
| `ONECLAW_AGENT_API_KEY` | For Intents/LLM | Agent API key (`ocv_...`)                                 |
| `OPENAI_API_KEY`        | Optional        | If not using Vault key for OpenAI, set for LLM proxy test |

## Expected output

With agent credentials and optional `OPENAI_API_KEY` (or Vault key):

```
── Shroud health checks ──
[OK]   GET /healthz → 200
[OK]   GET /health/ready → 200
[OK]   GET /health/live → 200

── Shroud Intents API (agent auth) ──
[OK]   GET /v1/health (no auth) → 401
[OK]   POST .../transactions (agent auth) → 400|403|...
[OK]   GET .../transactions → 200|403
[OK]   POST .../transactions/simulate → 400|403|422

── Shroud LLM proxy (OpenAI) ──
[OK]   POST /v1/chat/completions (OpenAI via Shroud) → 200
```

Without agent credentials, Intents and LLM steps are skipped.

## Running a real LLM query

1. Set **`OPENAI_API_KEY`** in `.env` (or store the key in your Vault at `providers/openai/api-key` with agent read access).
2. Ensure **`ONECLAW_AGENT_ID`** and **`ONECLAW_AGENT_API_KEY`** are set (Shroud must be able to reach the Vault to exchange the key).
3. Run:
    ```bash
    npm run real-llm
    ```
    This sends one real request through Shroud to OpenAI and prints the model reply.

## Running a real transaction

1. Ensure your **agent** has **Intents API enabled** and a **signing key** in the vault at `keys/base-signer` (or another chain your agent is allowed to use), with a **policy** granting the agent **read** on `keys/**`.
2. **Shroud** must be able to reach the **Vault** (if you get 401, fix Shroud↔Vault connectivity).
3. Run:
    ```bash
    npm run real-tx
    ```
    This submits a **minimal real transaction**: 0 value to the burn address on Base (no funds at risk). You’ll get a transaction ID or tx hash if signing and broadcast succeed.

## Next steps

- [Basic example](../basic/) — Vault, secrets, billing with the SDK
- [Transaction simulation](../tx-simulation/) — Full Intents API + guardrails in a chat UI
- [Shroud ops](https://github.com/1clawAI/shroud) — Deployment and operations
