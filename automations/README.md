# 1Claw SDK — Automations Examples

> **Reference only** — not for production use. Review and adapt for your own security requirements.

TypeScript scripts demonstrating the 1Claw Automations API: cron and webhook
automations using required `workflow_spec`, plus run history.

## Quick start

```bash
cd examples/automations
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY and ONECLAW_AGENT_ID
npx tsx create-scheduled-automation.ts
```

## What you'll learn

- Create a cron-scheduled automation (`trigger_type: "cron"`, `cron_expr`, `workflow_spec`)
- Create a webhook-triggered automation
- List and inspect automation run history
- Manage the full automation lifecycle (create, trigger, pause, delete)

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key
- An existing agent (create one at **Agents → Create Agent** in the dashboard)
- Automations are tier-gated (Free includes a small quota; paid plans raise limits)

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
| `cron` | Runs on a cron expression (e.g. `*/15 * * * *`). Dashboard may send `schedule`, which the API normalizes to `cron`. |
| `webhook` | Fires when the automation trigger URL receives a POST |
| `event` | Fires in response to vault/agent lifecycle events |
| `manual` | Only runs when explicitly triggered via API or dashboard |

### workflow_spec (required)

Create requests must include `workflow_spec`. Accepts either:

```json
{ "steps": [ { "type": "log", "action": "run_agent_task", "message": "..." } ] }
```

or a bare step array `[...]`. The dashboard maps legacy `action_type` UI fields onto this shape.
