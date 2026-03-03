# 1Claw Examples

> **Reference only** — these examples are for educational and demo purposes. They are not production-ready and may contain hardcoded values, skip error handling, or use development-only configurations. Always review and adapt for your own security requirements.

Nine example applications demonstrating the [1Claw](https://1claw.xyz) SDK, API, and MCP server in agentic workflows. Each is self-contained with a step-by-step walkthrough you can run in 5–10 minutes.

## Quick reference

| Example | Difficulty | Time | What you'll build |
|---------|-----------|------|-------------------|
| [basic](./basic/) | Beginner | 5 min | TypeScript scripts: vault CRUD, secrets, billing, signup, sharing, Intents API |
| [langchain-agent](./langchain-agent/) | Beginner | 5 min | LangChain agent fetches secrets just-in-time (OpenAI or Gemini) |
| [fastmcp-tool-server](./fastmcp-tool-server/) | Intermediate | 5 min | Custom MCP server with domain tools (rotate keys, deploy, parse env configs) |
| [nextjs-agent-secret](./nextjs-agent-secret/) | Intermediate | 5 min | AI chat app (Claude) accesses vault secrets with approval gates |
| [google-a2a](./google-a2a/) | Intermediate | 10 min | Two agents communicate via Google A2A protocol + 1Claw vaults (includes ADK demo) |
| [tx-simulation](./tx-simulation/) | Intermediate | 10 min | AI agent signs on-chain transactions with guardrails and Tenderly simulation |
| [shroud-demo](./shroud-demo/) | Intermediate | 5 min | Shroud TEE proxy: health, agent auth, Intents API, LLM proxy (key from Vault or header) |
| [ampersend-x402](./ampersend-x402/) | Advanced | 10 min | x402 micropayments via Ampersend — MCP/HTTP clients, hybrid billing, paywall server |
| [x402-payments](./x402-payments/) | Advanced | 5 min | Real x402 payments for 1Claw endpoints — EOA key in .env, GET/PUT secrets, audit, simulate |

## Getting started

### Option A — Seeded demo accounts (recommended for demos)

Use one org + user per example (no signup or email verification). Seed the DB once, then create vaults and credentials per demo (e.g. via the 1Claw dashboard or API) and set each example's `.env` with `ONECLAW_BASE_URL`, `ONECLAW_VAULT_ID`, `ONECLAW_API_KEY`, and `ONECLAW_AGENT_ID` for agent-based examples.

**1. Seed demo accounts** (run once, via Supabase MCP or psql against your 1Claw DB):

- Open `scripts/seed-demo-accounts.sql` and run its `INSERT` statements (e.g. in Supabase SQL Editor or via MCP). This creates 7 organizations and 7 users (`demo-basic@1claw.xyz`, `demo-langchain@1claw.xyz`, …). Shared password: `Demo1claw!seed`.

**2. Per demo:** Log in as that user, create a vault (and optionally an agent and API keys), then set that example's `.env` (or `.env.local` for nextjs-agent-secret) with the vault ID and API key.

Then from any example:

```bash
cd examples/<name>
npm install
npm start
```

Add `GOOGLE_API_KEY` or `OPENAI_API_KEY` for langchain-agent, `ANTHROPIC_API_KEY` for nextjs-agent-secret, and `SMART_ACCOUNT_ADDRESS` (and optional wallet key) for ampersend-x402 as needed.

**Test all examples:** From the repo root, run `./examples/scripts/test-all-examples.sh`. This installs deps (unless `SKIP_INSTALL=1`), runs each example’s main script or build, and reports pass/fail. CLI-style examples are run to completion or stopped after a short delay; Next.js examples are build-only.

**Cleanup:** To delete all secrets in demo accounts (except ampersend-x402, so `keys/x402-session-key` is kept), run `./scripts/cleanup-demo-secrets.sh` from the repo root.

### Option B — Manual setup

Every example follows the same pattern:

```bash
# 1. Set up the example (uses published @1claw/sdk@^0.8.0)
cd examples/<name>
npm install
cp .env.example .env     # or .env.local.example → .env.local for Next.js
# Fill in your credentials

# 2. Run it
npm start
```

## Recommended demo order

If you're new to 1Claw, walk through the examples in this order:

1. **[basic](./basic/)** — Learn the SDK fundamentals: auth, vaults, secrets, billing
2. **[langchain-agent](./langchain-agent/)** — See how an LLM agent decides when to fetch secrets
3. **[fastmcp-tool-server](./fastmcp-tool-server/)** — Build domain tools on top of the SDK
4. **[nextjs-agent-secret](./nextjs-agent-secret/)** — Full chat app with server-side secret handling
5. **[google-a2a](./google-a2a/)** — Multi-agent communication with vault credentials
6. **[tx-simulation](./tx-simulation/)** — On-chain transactions with guardrails and simulation
7. **[shroud-demo](./shroud-demo/)** — Shroud TEE proxy: health, Intents API, LLM proxy (no LLM key required if stored in Vault)
8. **[ampersend-x402](./ampersend-x402/)** — Payments and billing integration
9. **[x402-payments](./x402-payments/)** — Real x402 payments for all supported endpoints (EOA key in .env)

## What you need

| Credential | Where to get it | Which examples |
|-----------|----------------|----------------|
| 1Claw API key (`ocv_...`) | [1claw.xyz/settings/api-keys](https://1claw.xyz/settings/api-keys) | All |
| 1Claw vault + secrets | [1claw.xyz](https://1claw.xyz) dashboard | All except basic (creates its own) |
| Gemini API key | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free) | langchain, google-a2a, tx-simulation |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) | nextjs-agent-secret |
| OpenAI API key | [platform.openai.com](https://platform.openai.com) | langchain (alternative to Gemini); shroud-demo LLM proxy (optional if key in Vault) |
| 1Claw agent (ID + API key) | [1claw.xyz](https://1claw.xyz) — create agent, enable Intents API | shroud-demo, tx-simulation |
| Smart account + session key | [Ampersend docs](https://docs.ampersend.ai) | ampersend-x402 |
| EOA private key (Base USDC) | Generate hex key, fund with USDC on Base | x402-payments |

## About 1Claw

1Claw is an HSM-backed secrets manager for AI agents and humans. It provides encrypted vaults, granular access policies, an Intents API with guardrails, human-in-the-loop approvals, subscription billing with prepaid credits, and x402 micropayments.

- **SDK**: [@1claw/sdk](https://www.npmjs.com/package/@1claw/sdk)
- **MCP**: [@1claw/mcp](https://mcp.1claw.xyz) — vault, secrets, sharing, simulate/submit transaction tools
- **CLI**: [@1claw/cli](https://www.npmjs.com/package/@1claw/cli)
- **Docs**: [docs.1claw.xyz](https://docs.1claw.xyz)
- **Dashboard**: [1claw.xyz](https://1claw.xyz)
- **Pricing**: [1claw.xyz/pricing](https://1claw.xyz/pricing)