# 1Claw Examples

> **Reference only** — these examples are for educational and demo purposes. They are not production-ready and may contain hardcoded values, skip error handling, or use development-only configurations. Always review and adapt for your own security requirements.

Thirty-seven example applications demonstrating the [1Claw](https://1claw.xyz) SDK, API, and MCP server in agentic workflows. Each is self-contained with a step-by-step walkthrough you can run in 5–10 minutes.

## Quick reference

| Example                                       | Difficulty   | Time   | What you'll build                                                                          |
| --------------------------------------------- | ------------ | ------ | ------------------------------------------------------------------------------------------ |
| [basic](./basic/)                             | Beginner     | 5 min  | TypeScript scripts: vault CRUD, secrets, billing, signup, sharing, Intents API, Execution Intents (inline & vault-ref bindings) |
| [mpc-vault](./mpc-vault/)                     | Intermediate | 10 min | **MPC**: 2-of-2 client custody (`X-Client-Share`) and 2-of-3 multi-HSM vaults (tier-dependent) |
| [langchain-agent](./langchain-agent/)         | Beginner     | 5 min  | LangChain agent fetches secrets just-in-time (OpenAI or Gemini)                            |
| [fastmcp-tool-server](./fastmcp-tool-server/) | Intermediate | 5 min  | Custom MCP server with domain tools (rotate keys, deploy, parse env configs)               |
| [nextjs-agent-secret](./nextjs-agent-secret/) | Intermediate | 5 min  | AI chat app (Claude) accesses vault secrets with approval gates                            |
| [google-a2a](./google-a2a/)                   | Intermediate | 10 min | Two agents communicate via Google A2A protocol + 1Claw vaults (includes ADK demo)          |
| [tx-simulation](./tx-simulation/)             | Intermediate | 10 min | AI agent signs on-chain transactions with guardrails and Tenderly simulation               |
| [shroud-demo](./shroud-demo/)                 | Intermediate | 5 min  | Shroud TEE proxy: health, agent auth, Intents API, LLM proxy (key from Vault or header)    |
| [shroud-llm](./shroud-llm/)                   | Intermediate | 5 min  | Shroud + **LLM Token Billing**: JWT claims + **OpenAI, Anthropic, Google** via Stripe (or direct keys if billing off) |
| [local-inspect](./local-inspect/)             | Beginner     | 2 min  | Detect prompt injection, PII, and threats — no account needed, runs offline |
| [shroud-security](./shroud-security/)         | Intermediate | 5 min  | Shroud threat detection: Unicode, command injection, social engineering, encoding, network |
| [logos-chat](./logos-chat/)                    | Intermediate | 10 min | E2E encrypted agent-to-agent chat over Logos/Waku with AI auto-chat via Shroud              |
| [ampersend-x402](./ampersend-x402/)           | Advanced     | 10 min | x402 micropayments via Ampersend — MCP/HTTP clients, hybrid billing, paywall server        |
| [x402-payments](./x402-payments/)             | Advanced     | 5 min  | Real x402 payments for 1Claw endpoints — EOA key in .env, GET/PUT secrets, audit, simulate |
| [jwt-ttl-defense](./jwt-ttl-defense/)         | Intermediate | 5 min  | Prompt-injection steals an agent JWT — 3s TTL + scope/vault binding contain the blast radius |
| [intents-layers](./intents-layers/)           | Beginner     | 5 min  | **Two “intents”**: mock solver execution plan → 1Claw sign-only (agent never holds the key) |
| [intents-quick](./intents-quick/)             | Beginner     | 3 min  | **One API key, full Intents flow**: bootstrap vault + agent + Shroud, sign tx on Base Sepolia    |
| [anthropic-wif](./anthropic-wif/)             | Intermediate | 10 min | **OIDC federation**: 1claw mints RS256 JWT → Anthropic WIF → `sk-ant-oat01-…` (no static keys) |
| [multi-chain-keys](./multi-chain-keys/)       | Beginner     | 5 min  | **Multi-chain**: provision HSM-backed signing keys for 6 blockchains (Ethereum, Bitcoin, Solana, XRP, Cardano, Tron) |
| [multichain-agent](./multichain-agent/)       | Intermediate | 10 min | **Multichain chat demo**: brand-kit UI, bootstrap all 6 keys, testnet funding panel, Intents API chat on every chain |
| [evm-signing](./evm-signing/)                 | Intermediate | 5 min  | **EVM signing**: EIP-191 personal_sign, EIP-712 typed data, transaction types 0-2 (legacy, access list, EIP-1559) |
| [agentic-tx](./agentic-tx/)                   | Advanced     | 10 min | **Real transactions**: end-to-end agent creation → fund → sign → broadcast on Ethereum and Base with guardrails |
| [non-evm-keys](./non-evm-keys/)               | Beginner     | 5 min  | **Non-EVM signing**: provision keys and sign + broadcast native transactions on Bitcoin, Solana, XRP, Cardano, Tron |
| [platform-connect](./platform-connect/)       | Intermediate | 5 min  | **Platform API**: register an app, create a bootstrap template, provision users + vaults + agents |
| [treasury-wallets](./treasury-wallets/)       | Beginner     | 5 min  | **Treasury wallets**: generate multi-chain wallets, check balances, and send transactions         |
| [arc-stablecoin](./arc-stablecoin/)           | Intermediate | 5 min  | **Arc Testnet**: sign a native USDC transfer on a stablecoin-native EVM L2 via Intents API       |
| [bankr-key-vending](./bankr-key-vending/)     | Intermediate | 5 min  | **Bankr key vending**: deny-by-default policy, agent vs human lease, list/revoke, optional Shroud |
| [payment-cards](./payment-cards/)             | Intermediate | 5 min  | **Payment Card Vault**: enable guardrails, order a prepaid card via x402, poll to ready, reveal    |
| [execution-intents](./execution-intents/)     | Intermediate | 5 min  | **Execution Intents**: HTTP/GraphQL bindings — agents call external APIs without seeing credentials |
| [python-sdk](./python-sdk/)                   | Beginner     | 5 min  | **Python SDK**: vault CRUD, secrets, billing, agent auth & audit (`pip install oneclaw`)            |
| [automations](./automations/)                 | Beginner     | 5 min  | **Automations**: cron-scheduled, webhook-triggered automations and run history                      |
| [agent-memory](./agent-memory/)               | Beginner     | 5 min  | **Agent Memory**: durable key-value storage, namespace browsing, TTL scratch entries                |
| [cloud-runtime](./cloud-runtime/)             | Beginner     | 5 min  | **Cloud Runtimes**: deploy agents to managed runtimes with HTTP exposure and lifecycle management   |
| [agent-discovery](./agent-discovery/)         | Beginner     | 5 min  | **Agent Discovery**: agent cards, public directory browsing, tag-based search                       |
| [langchain-1claw](./langchain-1claw/)         | Beginner     | 5 min  | **LangChain (Python)**: tool-calling agent, persistent chat memory, RAG retriever (`pip install langchain-1claw`) |
| [crewai-tools](./crewai-tools/)               | Beginner     | 5 min  | **CrewAI (Python)**: multi-agent crew with vault, memory, signing, and automation tools (`pip install 1claw-crewai-tools`) |
| [sign-in-with-1claw](./sign-in-with-1claw/)   | Beginner     | 5 min  | **OAuth**: "Sign in with 1Claw" flow with PKCE — plain HTML, no build step                                                 |

**Shroud LLM:** Examples that hit Shroud’s OpenAI-compatible surface (`shroud-demo`, `shroud-llm`) must send **`X-Shroud-Provider`** (e.g. `openai`, `anthropic`, `google`) on chat requests; omitting it returns **400** from Shroud.

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

**Test all examples:** From the repo root, run `./examples/scripts/test-all-examples.sh`. This installs deps (unless `SKIP_INSTALL=1`), runs each example’s main script or build, and reports pass/fail (30 examples). When `ADMIN_EMAIL`/`ADMIN_PASSWORD` or `ONECLAW_TEST_*` are set in the repo root `.env`, the script mints a ephemeral `1ck_` key for the **basic** and **python-sdk** examples. CLI-style examples are run to completion or stopped after a short delay; Next.js examples are build-only. **shroud-llm** skips unless `.env` has agent credentials; use an org with LLM Token Billing enabled for full JWT checks. **mpc-vault**, **payment-cards**, and **execution-intents** are typecheck-only in the aggregate script (live runs need Pro+ keys and org settings). **intents-layers** is typecheck-only in CI; run `npm start` locally for the narrative + optional live `signTransaction`. **multi-chain-keys**, **evm-signing**, **agentic-tx**, **non-evm-keys**, **treasury-wallets**, **arc-stablecoin**, and **bankr-key-vending** are typecheck-only in CI (live runs need a `1ck_` key; Bankr lease also needs `BANKR_PARTNER_KEY` on Vault for full vending).

**Cleanup:** To delete all secrets in demo accounts (except ampersend-x402, so `keys/x402-session-key` is kept), run `./scripts/cleanup-demo-secrets.sh` from the repo root.

### Option B — Manual setup

**Bootstrap all env files at once** (copies each example’s template to `.env` or `.env.local` if the target file does not exist yet):

```bash
cd examples
npm run bootstrap
# Or from the monorepo root:
./examples/scripts/bootstrap-env.sh
```

- **`nextjs-agent-secret`** uses `.env.local.example` → `.env.local` (Next.js convention).
- All other examples use `.env.example` → `.env`.
- Existing files are **not** overwritten; use `./examples/scripts/bootstrap-env.sh --force` to replace them.
- Bootstrap one folder only: `./examples/scripts/bootstrap-env.sh basic`
- Preview: `./examples/scripts/bootstrap-env.sh --dry-run`

Then edit each file with your API keys and vault IDs from [1claw.xyz](https://1claw.xyz).

Every example also follows the same per-folder pattern:

```bash
# 1. Set up the example (uses published @1claw/sdk — check each example’s package.json for the range)
cd examples/<name>
npm install
# If npm reports peer dependency conflicts (e.g. langchain-agent), use:
#   npm install --legacy-peer-deps
cp .env.example .env     # or .env.local.example → .env.local for Next.js — or use npm run bootstrap above
# Fill in your credentials

# 2. Run it
npm start
```

## Recommended demo order

If you're new to 1Claw, walk through the examples in this order:

1. **[basic](./basic/)** — Learn the SDK fundamentals: auth, vaults, secrets, billing
2. **[mpc-vault](./mpc-vault/)** — Optional: MPC 2-of-2 and 2-of-3 vault flows (tier + infra dependent)
3. **[langchain-agent](./langchain-agent/)** — See how an LLM agent decides when to fetch secrets
4. **[fastmcp-tool-server](./fastmcp-tool-server/)** — Build domain tools on top of the SDK
5. **[nextjs-agent-secret](./nextjs-agent-secret/)** — Full chat app with server-side secret handling
6. **[google-a2a](./google-a2a/)** — Multi-agent communication with vault credentials
7. **[tx-simulation](./tx-simulation/)** — On-chain transactions with guardrails and simulation
8. **[local-inspect](./local-inspect/)** — Detect threats in LLM output locally — no account, no network
9. **[shroud-demo](./shroud-demo/)** — Shroud TEE proxy: health, Intents API, LLM proxy (no LLM key required if stored in Vault)
10. **[shroud-llm](./shroud-llm/)** — Same Shroud LLM path, focused on orgs with **LLM Token Billing** (JWT claims + optional org API check)
11. **[shroud-security](./shroud-security/)** — Shroud threat detection filters: Unicode, injection, social engineering
12. **[logos-chat](./logos-chat/)** — E2E encrypted agent-to-agent chat over Logos/Waku
13. **[ampersend-x402](./ampersend-x402/)** — Payments and billing integration
14. **[x402-payments](./x402-payments/)** — Real x402 payments for all supported endpoints (EOA key in .env)
15. **[jwt-ttl-defense](./jwt-ttl-defense/)** — Prompt-injection JWT theft contained by a 3-second TTL + scope/vault binding
16. **[multi-chain-keys](./multi-chain-keys/)** — Provision signing keys for 6 blockchains and view derived addresses
17. **[multichain-agent](./multichain-agent/)** — Chat UI demo: bootstrap + fund all testnets + transact via Intents API
18. **[evm-signing](./evm-signing/)** — EIP-191, EIP-712, and all EIP-2718 transaction types
19. **[agentic-tx](./agentic-tx/)** — Real on-chain transactions with mainnet funds and guardrails
20. **[non-evm-keys](./non-evm-keys/)** — Non-EVM signing + broadcast (Bitcoin, Solana, XRP, Cardano, Tron)
21. **[treasury-wallets](./treasury-wallets/)** — Generate multi-chain wallets, check balances, send
22. **[arc-stablecoin](./arc-stablecoin/)** — Sign a USDC transfer on Arc Testnet (stablecoin-native L2)
23. **[python-sdk](./python-sdk/)** — Python SDK: vault CRUD, secrets, billing, agent auth
24. **[automations](./automations/)** — Schedule agents on cron or webhook triggers
25. **[agent-memory](./agent-memory/)** — Durable and scratch memory with TTL expiry
26. **[cloud-runtime](./cloud-runtime/)** — Deploy agents to managed cloud runtimes
27. **[agent-discovery](./agent-discovery/)** — Make agents discoverable in the public directory
28. **[langchain-1claw](./langchain-1claw/)** — Python LangChain: tools, persistent chat memory, RAG retriever
29. **[crewai-tools](./crewai-tools/)** — Python CrewAI: multi-agent crews with vault, memory, and signing
30. **[sign-in-with-1claw](./sign-in-with-1claw/)** — "Sign in with 1Claw" OAuth 2.0 + PKCE (plain HTML, no build step)

## What you need

| Credential                  | Where to get it                                                         | Which examples                                                                      |
| --------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1Claw API key (`1ck_` / `ocv_`) | [1claw.xyz/settings/api-keys](https://1claw.xyz/settings/api-keys)   | Human `1ck_` for mpc-vault; agent `ocv_` for most agent demos; all except local-inspect |
| 1Claw vault + secrets       | [1claw.xyz](https://1claw.xyz) dashboard                                | All except basic (creates its own)                                                  |
| Gemini API key              | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free) | langchain, google-a2a, tx-simulation                                                |
| Anthropic API key           | [console.anthropic.com](https://console.anthropic.com)                  | nextjs-agent-secret                                                                 |
| OpenAI API key              | [platform.openai.com](https://platform.openai.com)                      | langchain (alternative to Gemini); shroud-demo / shroud-llm (optional if key in Vault) |
| 1Claw agent (ID + API key)  | [1claw.xyz](https://1claw.xyz) — create agent, Shroud enabled for LLM   | shroud-demo, shroud-llm, tx-simulation                                                |
| Smart account + session key | [Ampersend docs](https://docs.ampersend.ai)                             | ampersend-x402                                                                      |
| EOA private key (Base USDC) | Generate hex key, fund with USDC on Base                                | x402-payments                                                                       |

## About 1Claw

1Claw is an HSM-backed secrets manager for AI agents and humans. It provides encrypted vaults, granular access policies, an Intents API with guardrails, human-in-the-loop approvals, subscription billing with prepaid credits, and x402 micropayments.

- **SDK**: [@1claw/sdk](https://www.npmjs.com/package/@1claw/sdk)
- **MCP**: [@1claw/mcp](https://mcp.1claw.xyz) — vault, secrets, sharing, simulate/submit transaction tools
- **CLI**: [@1claw/cli](https://www.npmjs.com/package/@1claw/cli)
- **Docs**: [docs.1claw.xyz](https://docs.1claw.xyz)
- **Dashboard**: [1claw.xyz](https://1claw.xyz)
- **Pricing**: [1claw.xyz/pricing](https://1claw.xyz/pricing)