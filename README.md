# 1Claw Examples

> **Warning — Reference Only**
> These examples are for **educational and reference purposes only**. They are not production-ready and should not be deployed as-is. They may contain hardcoded values, skip error handling, omit security best practices, or use development-only configurations. Always review and adapt code for your own security and reliability requirements before using it in production.

Example applications demonstrating the [1Claw](https://1claw.xyz) SDK, API, and MCP server in agentic workflows.

## Examples

| Example | Difficulty | Description |
|---------|-----------|-------------|
| [basic](./basic/) | ![Beginner](https://img.shields.io/badge/-Beginner-green) | TypeScript scripts: vault CRUD, secrets, billing, signup, email sharing, and crypto transaction proxy |
| [langchain-agent](./langchain-agent/) | ![Beginner](https://img.shields.io/badge/-Beginner-green) | LangChain agent that fetches API keys from a 1Claw vault just-in-time, with custom tool and MCP client approaches |
| [nextjs-agent-secret](./nextjs-agent-secret/) | ![Intermediate](https://img.shields.io/badge/-Intermediate-blue) | AI agent (Claude + Vercel AI SDK) accesses vault secrets with human approval gates |
| [fastmcp-tool-server](./fastmcp-tool-server/) | ![Intermediate](https://img.shields.io/badge/-Intermediate-blue) | Custom FastMCP server that composes 1Claw SDK into domain-specific tools (rotate keys, deploy services, parse env configs) |
| [google-a2a](./google-a2a/) | ![Intermediate](https://img.shields.io/badge/-Intermediate-blue) | Two agents communicating via Google's A2A protocol, with 1Claw as the secure credential layer |
| [tx-simulation](./tx-simulation/) | ![Intermediate](https://img.shields.io/badge/-Intermediate-blue) | Transaction simulation with Tenderly — preview gas costs, balance changes, and revert reasons before signing |
| [ampersend-x402](./ampersend-x402/) | ![Advanced](https://img.shields.io/badge/-Advanced-red) | x402 micropayments via Ampersend SDK — MCP/HTTP clients, hybrid billing, smart account paywall server + client |

## Testing all examples

To smoke-test every example (build SDK, install deps, run each with a timeout):

```bash
# From repo root: build SDK first
cd packages/sdk && npm run build && cd ../..

# From examples directory
cd examples
./scripts/test-all.sh
```

Without real credentials, most examples exit with a "missing env" message — that's expected. See [TESTING.md](./TESTING.md) for full E2E steps and required env vars per example.

## Getting started

Every example follows the same pattern:

```bash
cd examples/<name>
npm install
cp .env.example .env
# Fill in your keys
npm start
```

All examples use `@1claw/sdk` via a local workspace link. Make sure you've built the SDK first:

```bash
cd packages/sdk && npm run build
```

## About 1Claw

1Claw is an HSM-backed secrets manager for AI agents and humans. It provides encrypted vaults, granular access policies, human-in-the-loop approvals, subscription billing with prepaid credits, and x402 micropayments for API access.

- **SDK**: [@1claw/sdk](https://github.com/1clawAI/1claw-sdk)
- **MCP**: [@1claw/mcp](https://mcp.1claw.xyz) — 11 tools for vault operations
- **Docs**: [docs.1claw.xyz](https://docs.1claw.xyz)
- **Dashboard**: [1claw.xyz](https://1claw.xyz)
- **Pricing**: [1claw.xyz/pricing](https://1claw.xyz/pricing)