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
- Use AI generation steps (`ai_generate`) with agent memory (`memory_put`)
- Pass data between steps with template variables (`{{steps.<name>.<field>}}`)
- Use conditional execution (`skip_if`, `run_if`) and branching (`condition`)
- Reference webhook payloads (`{{webhook_payload.<path>}}`) in workflow steps
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
| `npx tsx ai-generate-automation.ts` | `ai-generate-automation.ts` | AI content generation with memory and notifications |
| `npx tsx conditional-automation.ts` | `conditional-automation.ts` | Health check with conditional alerting |
| `npx tsx webhook-variables-automation.ts` | `webhook-variables-automation.ts` | Webhook with variable passing and conditional notify |
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

### Template variables

Reference previous step outputs or webhook payloads using `{{...}}` syntax:

```json
{
  "type": "notify",
  "params": {
    "channel": "email",
    "to": "team@example.com",
    "subject": "Result: {{steps.0.output}}"
  }
}
```

To deliver to a messaging channel (Telegram, WhatsApp, Discord):

```json
{
  "type": "notify",
  "params": {
    "channel": "channel",
    "channel_id": "<uuid of the agent channel>",
    "message": "Automation complete: {{steps.0.output}}"
  }
}
```

Available variable roots:

| Syntax | Description |
|--------|-------------|
| `{{steps.<index_or_name>.<field>}}` | Output from a previous step (by index or `name` field) |
| `{{webhook_payload.<path>}}` | Fields from the incoming webhook POST body |
| `{{trigger.<path>}}` | Alias for `webhook_payload` |

Nested JSON paths use dot-separation (e.g. `{{steps.balance.output.native_balance}}`).
String values starting with `{` or `[` after substitution are parsed back as JSON.

### Conditional execution

Add `skip_if` or `run_if` at the **step root** (not inside `params`) to control whether a step runs:

```json
{ "type": "notify", "skip_if": "{{steps.check.http_status}} == 200", "params": { "..." } }
{ "type": "http", "run_if": "{{webhook_payload.enabled}} == true", "url": "..." }
```

Supported operators:

| Operator | Behavior |
|----------|----------|
| `==` | String equality |
| `!=` | String inequality |
| `contains` | Substring match |
| `>`, `<`, `>=`, `<=` | Numeric (f64) comparison |
| _(bare value)_ | Truthy check (non-empty, not `false`/`0`/`null`) |

### Step types

| Type | Description |
|------|-------------|
| `log` | Log a message |
| `http` | HTTP request (GET/POST/PUT/PATCH/DELETE) with SSRF protection |
| `wait` | Pause execution (max 30s) |
| `swap` | DEX token swap via 0x |
| `submit_transaction` | EVM transaction signing |
| `execute_intent` | Execute via configured binding |
| `rotate_generate` | Server-side secret rotation |
| `ai_generate` | LLM text generation (via Shroud or Vault) |
| `memory_get` | Read agent memory |
| `memory_put` | Write agent memory |
| `memory_search` | Semantic search over agent memory |
| `notify` | Send notification (webhook/slack/email/channel) |
| `approval_request` | Pause run for human approval |
| `condition` | If/else branching with sub-steps |
