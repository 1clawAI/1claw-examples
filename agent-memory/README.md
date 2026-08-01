# 1Claw SDK — Agent Memory Examples

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Three TypeScript scripts demonstrating agent memory: durable key-value storage, semantic similarity search via vector embeddings, and TTL-based scratch entries that auto-expire.

## Quick start

```bash
cd examples/agent-memory
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY and ONECLAW_AGENT_ID
npx tsx durable-memory.ts
```

## What you'll learn

- Store and retrieve encrypted durable memory entries (key-value per namespace)
- Use TTL-based scratch entries that automatically expire
- List namespaces and entries within each namespace
- Manage the memory lifecycle (put, get, list, delete)

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key
- An existing agent with **memory enabled** (`memory_enabled: true`)
- **Pro plan or higher** — agent memory requires a paid subscription

### Enabling memory on an agent

Enable memory via the dashboard (Agent detail → Memory toggle) or via the SDK:

```typescript
await client.agents.update(agentId, { memory_enabled: true });
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Your API key (`1ck_...`). Get one at [Settings → API Keys](https://1claw.xyz/settings/api-keys). |
| `ONECLAW_AGENT_ID` | Yes | UUID of the agent with memory enabled. |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npx tsx durable-memory.ts` | `durable-memory.ts` | Store and retrieve durable memory entries |
| `npx tsx semantic-search.ts` | `semantic-search.ts` | Store entries and browse by namespace (vector search is server-side) |
| `npx tsx ttl-scratch.ts` | `ttl-scratch.ts` | Store scratch entries with TTL expiry |

## Key concepts

### Memory tiers

| Tier | Description | TTL |
|------|-------------|-----|
| **Durable** | Persistent key-value pairs encrypted at rest. Survives agent restarts. | No expiry |
| **Scratch** | Ephemeral entries with a TTL. Good for caching, session state, rate-limit counters. | Configurable (seconds) |

### Namespaces

Memory entries are organized into namespaces (e.g. `preferences`, `cache`, `session`). Each agent can have multiple namespaces. Agents can optionally restrict which namespaces they can access via `memory_namespace_allowlist`.

### Encryption

All memory values are encrypted at rest using envelope encryption (AES-256-GCM with KMS-managed KEKs) — the same scheme used for vault secrets. Values are JSON — you can store strings, objects, arrays, or numbers.

## Next steps

- [Automations](../automations/) — Schedule agents to run on cron or webhook triggers
- [Cloud Runtime](../cloud-runtime/) — Deploy agents to hosted runtimes
- [1Claw Docs](https://docs.1claw.xyz)
