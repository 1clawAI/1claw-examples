# 1Claw SDK — Automations Examples

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Three TypeScript scripts demonstrating the 1Claw Automations API: creating scheduled (cron) automations, webhook-triggered automations, and listing run history.

## Quick start

```bash
cd examples/automations
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY and ONECLAW_AGENT_ID
npx tsx create-scheduled-automation.ts
```

## What you'll learn

- Create a cron-scheduled automation that runs an agent on a recurring cadence
- Create a webhook-triggered automation that fires when a URL is called
- List and inspect automation run history
- Manage the full automation lifecycle (create, trigger, pause, delete)

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key
- An existing agent (create one at **Agents → Create Agent** in the dashboard)
- **Pro plan or higher** — automations require a paid subscription

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Your API key (`1ck_...`). Get one at [Settings → API Keys](https://1claw.xyz/settings/api-keys). |
| `ONECLAW_AGENT_ID` | Yes | UUID of the agent to attach automations to. |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npx tsx create-scheduled-automation.ts` | `create-scheduled-automation.ts` | Create a cron-scheduled automation |
| `npx tsx webhook-automation.ts` | `webhook-automation.ts` | Create a webhook-triggered automation |
| `npx tsx list-runs.ts` | `list-runs.ts` | List automation run history |

## Key concepts

### Trigger types

| Type | Description |
|------|-------------|
| `schedule` | Runs on a cron expression (e.g. `*/15 * * * *` for every 15 minutes) |
| `webhook` | Fires when the automation's webhook URL receives a POST request |
| `event` | Fires in response to vault/agent lifecycle events |
| `manual` | Only runs when explicitly triggered via API or dashboard |

### Action types

The `action_type` field defines what happens when the automation fires. Common values include `agent_invoke`, `webhook_call`, and `secret_rotate`.

## Next steps

- [Agent Memory](../agent-memory/) — Store and search durable agent memory
- [Cloud Runtime](../cloud-runtime/) — Deploy agents to hosted runtimes
- [1Claw Docs](https://docs.1claw.xyz)
