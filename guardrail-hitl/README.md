# Graduated HITL guardrails (v0.54–0.55)

Configure an agent with graduated human-in-the-loop (HITL) transaction approval using the TypeScript SDK.

## Prerequisites

- `ONECLAW_API_KEY` (human `1ck_` key)
- Pro+ tier recommended for full HITL flows

## What this demonstrates

1. Create an agent with `intents_api_enabled`
2. Set `tx_approval_policy` so large native transfers return **202** `awaiting_approval`
3. Set `typed_data_policy` / `simulation_failure_policy` to route edge cases to HITL instead of hard deny
4. Approve via dashboard or `POST /v1/approvals/{id}/decide`

## Run

```bash
cd examples/guardrail-hitl
npm install
ONECLAW_API_KEY=1ck_... npx tsx src/configure-hitl.ts
```

## Example policy

```json
{
  "require_above_native": { "ethereum": "0.1", "base": "0.05" },
  "require_for_new_recipients": true,
  "require_for_unlimited_approvals": true,
  "require_for_chains": ["ethereum", "base"]
}
```

When a matching transaction is submitted, the API returns:

```json
{
  "status": "awaiting_approval",
  "approval_id": "..."
}
```

Humans approve in the dashboard **Approvals** inbox or via:

```bash
1claw approval decide <approval_id> --decision approved
```

## Org emergency freeze

Owner/admin can halt all agent tx/execution:

```bash
curl -X POST https://api.1claw.co/v1/org/freeze \
  -H "Authorization: Bearer $ONECLAW_TOKEN"
```

Unfreeze with `POST /v1/org/unfreeze`.
