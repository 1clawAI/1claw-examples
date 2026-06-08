# Bankr Dynamic Key Vending

Demonstrates [Bankr dynamic key vending](https://docs.1claw.xyz/guides/bankr-key-vending) end to end:

1. **Deny-by-default** — agent lease returns **403** without a policy on `__agent-keys`
2. **Least-privilege policy** — `write` on `agents/{agent_id}/bankr/*` only
3. **Agent lease** — metadata only (`lease_id`, `wallet_id`, `expires_at`); **no `api_key`**
4. **Human lease** — one-time `bk_usr_` key when Vault has `BANKR_PARTNER_KEY` configured
5. **List + revoke** — audit active leases and revoke after the task
6. **Shroud (optional)** — `X-Shroud-Provider: bankr` resolves the leased key inside the TEE

## Prerequisites

- A 1Claw user API key (`1ck_`) from **Settings → API Keys**
- Production Bankr vending requires your org's partner key: **Settings → Bankr** in the dashboard, or `PUT /v1/org/bankr-config`. Without org BYOK (or a deployment `BANKR_PARTNER_KEY` fallback), lease calls return **400** and the example still validates policy enforcement.

## Run

```bash
cd examples/bankr-key-vending
cp .env.example .env   # paste ONECLAW_API_KEY
npm install
npm start
```

Set `ONECLAW_AGENT_ID` + `ONECLAW_AGENT_API_KEY` to skip agent creation.

### Shroud probe

After a successful lease, set `BANKR_SHROUD_PROBE=1` to send a minimal chat request through Shroud with `X-Shroud-Provider: bankr` (agent must have `shroud_enabled: true`).

## Related

- Guide: `docs/docs/guides/bankr-key-vending.md`
- MCP tool: `lease_bankr_key` (never returns `bk_usr_` in tool output)
- CLI: `1claw agent bankr-keys lease --ttl 900`
