# Anthropic Workload Identity Federation — end-to-end with 1claw

> **Reference only** — not for production use.

This example exercises the full Anthropic WIF flow with 1claw as the OIDC IdP:

1. **Provision** an agent in 1claw with `federation_enabled = true`, an audience allowlist of `https://api.anthropic.com`, and a 15-minute TTL.
2. **Mint** an RS256-signed federation JWT via `POST /v1/auth/federated-token`.
3. **Decode** the JWT and assert that the `kid` resolves against `https://api.1claw.co/.well-known/jwks.json`.
4. **Exchange** the JWT at Anthropic's `POST /v1/oauth/token` (skippable in CI via `DEMO_SKIP_ANTHROPIC=1`).
5. **Call** the Claude API with the resulting `sk-ant-oat01-…` token.
6. **Clean up** the demo agent.

Zero static Anthropic keys are used — the only secret on disk is the 1claw user API key (`1ck_…`).

## Prerequisites

1. A 1claw account on a tier that allows agent creation (Pro, Business, Enterprise, or platform admin).
2. A 1claw user API key with org-admin scope (`1ck_…`).
3. An Anthropic WIF provider registered with:
   - Issuer URL: `https://api.1claw.co`
   - JWKS URL: `https://api.1claw.co/.well-known/jwks.json`
   - Allowed audience: `https://api.anthropic.com`
   - Subject claim: `sub`

(You can skip step 3 by setting `DEMO_SKIP_ANTHROPIC=1`; the script will still mint and decode the federated JWT.)

## Run

```bash
cd examples/anthropic-wif
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY=1ck_…
npm start
```

Expected output (abbreviated):

```
[1] Created demo agent abc-123 with federation_enabled=true
[2] Exchanged 1claw credential → federated JWT (alg=RS256, kid=rs256-v1, expires_in=900s)
[3] Verified kid 'rs256-v1' is published at https://api.1claw.co/.well-known/jwks.json
[4] Exchanged federated JWT at Anthropic → sk-ant-oat01-… (expires_in=…)
[5] Claude responded: "Hello from 1claw!"
[cleanup] Deleted agent abc-123
```

If `DEMO_SKIP_ANTHROPIC=1`, steps [4] and [5] are skipped.

## What this proves

- 1claw is a working OIDC IdP — `/.well-known/openid-configuration`, `/.well-known/jwks.json`, and `POST /v1/auth/federated-token` line up exactly with what Anthropic's WIF expects.
- Tokens carry `iss=https://api.1claw.co`, `sub=agent:<uuid>`, the requested `aud`, and a `kid` that resolves in the published JWKS.
- The audience allowlist enforces zero-trust: minting a token for `https://evil.example.com` returns 403 even with a valid 1claw credential.
- The whole flow uses short-lived bearer tokens — no static `sk-ant-…` key on disk.

## Cleanup

The script always tries to delete the demo agent on exit (success, failure, or Ctrl+C). If you ever leave one orphaned, delete it from the dashboard or via:

```bash
1claw agent delete <agent-id>
```
