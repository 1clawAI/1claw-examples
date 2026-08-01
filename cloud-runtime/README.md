# 1Claw SDK — Cloud Runtime Examples

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Three TypeScript scripts demonstrating cloud runtimes: deploying an agent to a managed runtime, exposing it via a public HTTP endpoint, and managing the full lifecycle (create, start, status, stop, delete).

## Quick start

```bash
cd examples/cloud-runtime
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY and ONECLAW_AGENT_ID
npx tsx deploy-agent.ts
```

## What you'll learn

- Create a cloud runtime for an agent with a preset configuration
- Expose a runtime with a public HTTP endpoint and custom slug
- Manage the full runtime lifecycle: create → start → status → stop → delete
- Configure idle timeouts and environment variables

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key
- An existing agent (create one at **Agents → Create Agent** in the dashboard)
- **Pro plan or higher** — cloud runtimes require a paid subscription

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Your API key (`1ck_...`). Get one at [Settings → API Keys](https://1claw.xyz/settings/api-keys). |
| `ONECLAW_AGENT_ID` | Yes | UUID of the agent to deploy. |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npx tsx deploy-agent.ts` | `deploy-agent.ts` | Create and start a cloud runtime |
| `npx tsx expose-http.ts` | `expose-http.ts` | Deploy with a public HTTP endpoint |
| `npx tsx runtime-lifecycle.ts` | `runtime-lifecycle.ts` | Full lifecycle: create → start → stop → delete |

## Key concepts

### Presets

Presets define the compute resources allocated to a runtime:

| Preset | CPU | Memory | Use case |
|--------|-----|--------|----------|
| `micro` | 0.25 vCPU | 256 MB | Lightweight cron agents |
| `small` | 0.5 vCPU | 512 MB | Standard agents |
| `medium` | 1 vCPU | 1 GB | Agents with moderate compute needs |
| `large` | 2 vCPU | 4 GB | High-throughput or ML workloads |

### HTTP exposure

Runtimes can optionally expose an HTTP endpoint with a custom slug:

- **Slug**: Unique subdomain (e.g. `my-agent` → `my-agent.runtime.1claw.xyz`)
- **Inbound auth**: `api_key` (default), `jwt`, or `public`
- **Port**: The container port to forward (default: 8080)

### Idle timeout

Runtimes auto-stop after a period of inactivity to save costs. The `idle_timeout_secs` field controls this (default: 3600 seconds / 1 hour).

## Next steps

- [Automations](../automations/) — Trigger agent actions on a schedule or webhook
- [Agent Discovery](../agent-discovery/) — Make your agent discoverable in the public directory
- [1Claw Docs](https://docs.1claw.xyz)
