# 1Claw Examples

> **Reference only** — these examples are for educational and demo purposes. They are not production-ready and may contain hardcoded values, skip error handling, or use development-only configurations. Always review and adapt for your own security requirements.

Seven example applications demonstrating the [1Claw](https://1claw.xyz) SDK, API, and MCP server in agentic workflows. Each is self-contained with a step-by-step walkthrough you can run in 5–10 minutes.

## Quick reference

| Example | Difficulty | Time | What you'll build |
|---------|-----------|------|-------------------|
| [basic](./basic/) | Beginner | 5 min | TypeScript scripts: vault CRUD, secrets, billing, signup, sharing, Intents API |
| [langchain-agent](./langchain-agent/) | Beginner | 5 min | LangChain agent fetches secrets just-in-time (OpenAI or Gemini) |
| [fastmcp-tool-server](./fastmcp-tool-server/) | Intermediate | 5 min | Custom MCP server with domain tools (rotate keys, deploy, parse env configs) |
| [nextjs-agent-secret](./nextjs-agent-secret/) | Intermediate | 5 min | AI chat app (Claude) accesses vault secrets with approval gates |
| [google-a2a](./google-a2a/) | Intermediate | 10 min | Two agents communicate via Google A2A protocol + 1Claw vaults (includes ADK demo) |
| [tx-simulation](./tx-simulation/) | Intermediate | 10 min | AI agent signs on-chain transactions with guardrails and Tenderly simulation |
| [ampersend-x402](./ampersend-x402/) | Advanced | 10 min | x402 micropayments via Ampersend — MCP/HTTP clients, hybrid billing, paywall server |

## Getting started

Every example follows the same pattern:

```bash
# 1. Build the SDK (required once)
cd packages/sdk && npm run build && cd ../..

# 2. Set up the example
cd examples/<name>
npm install
cp .env.example .env     # or .env.local.example → .env.local for Next.js
# Fill in your credentials

# 3. Run it
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
7. **[ampersend-x402](./ampersend-x402/)** — Payments and billing integration

## What you need

| Credential | Where to get it | Which examples |
|-----------|----------------|----------------|
| 1Claw API key (`ocv_...`) | [1claw.xyz/settings/api-keys](https://1claw.xyz/settings/api-keys) | All |
| 1Claw vault + secrets | [1claw.xyz](https://1claw.xyz) dashboard | All except basic (creates its own) |
| Gemini API key | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free) | langchain, google-a2a, tx-simulation |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) | nextjs-agent-secret |
| OpenAI API key | [platform.openai.com](https://platform.openai.com) | langchain (alternative to Gemini) |
| Smart account + session key | [Ampersend docs](https://docs.ampersend.ai) | ampersend-x402 |

## About 1Claw

1Claw is an HSM-backed secrets manager for AI agents and humans. It provides encrypted vaults, granular access policies, an Intents API with guardrails, human-in-the-loop approvals, subscription billing with prepaid credits, and x402 micropayments.

- **SDK**: [@1claw/sdk](https://www.npmjs.com/package/@1claw/sdk)
- **MCP**: [@1claw/mcp](https://mcp.1claw.xyz) — 11 tools for vault operations
- **CLI**: [@1claw/cli](https://www.npmjs.com/package/@1claw/cli)
- **Docs**: [docs.1claw.xyz](https://docs.1claw.xyz)
- **Dashboard**: [1claw.xyz](https://1claw.xyz)
- **Pricing**: [1claw.xyz/pricing](https://1claw.xyz/pricing)
