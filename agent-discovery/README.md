# 1Claw SDK — Agent Discovery Examples

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Two TypeScript scripts demonstrating the agent discovery system: making an agent discoverable with a public agent card, and browsing the public agent directory.

## Quick start

```bash
cd examples/agent-discovery
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY and ONECLAW_AGENT_ID
npx tsx make-discoverable.ts
```

## What you'll learn

- Enable discovery on an agent and configure its public agent card
- Set public-facing description, tags, and protocol URLs (A2A, MCP)
- Browse the public agent directory (no auth required)
- Search and filter agents by tags or keywords

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key
- An existing agent (for `make-discoverable.ts`)
- **No plan required** for browsing the directory — it's public

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes* | Your API key (`1ck_...`). Required for `make-discoverable.ts` only. |
| `ONECLAW_AGENT_ID` | Yes* | UUID of the agent to make discoverable. Required for `make-discoverable.ts` only. |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

*Not required for `browse-directory.ts` — the directory endpoint is public.

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npx tsx make-discoverable.ts` | `make-discoverable.ts` | Enable discovery and set up an agent card |
| `npx tsx browse-directory.ts` | `browse-directory.ts` | Browse the public agent directory |

## Key concepts

### Agent cards

When discovery is enabled, an agent gets a public **agent card** accessible at `GET /v1/agents/{id}/card`. The card includes:

- **Name** and **description** — public-facing summary of what the agent does
- **Tags** — for search and categorization (e.g. `defi`, `security`, `nft`)
- **A2A URL** — Agent-to-Agent protocol endpoint for interoperability
- **MCP URL** — Model Context Protocol endpoint
- **Capabilities** — list of things the agent can do

### Agent directory

The public directory at `GET /v1/agents/directory` lists all discoverable agents. It supports:

- **Search** — full-text search via `?q=` query parameter
- **Tag filtering** — filter by tags via `?tags=defi,security`
- **Pagination** — `?page=` and `?page_size=` parameters

### Discovery fields on the agent

| Field | Type | Description |
|-------|------|-------------|
| `discoverable` | boolean | Whether the agent appears in the directory |
| `public_description` | string | Public-facing description (shown in the card) |
| `public_tags` | string[] | Tags for search and filtering |
| `a2a_url` | string | Agent-to-Agent protocol URL |

## Next steps

- [Cloud Runtime](../cloud-runtime/) — Deploy discoverable agents to hosted runtimes
- [Automations](../automations/) — Schedule recurring agent tasks
- [1Claw Docs](https://docs.1claw.xyz)
