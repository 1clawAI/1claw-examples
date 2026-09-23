# Passkey Safe — non-custodial signing owned by your own passkey

A Gnosis Safe whose **only owner is your WebAuthn passkey**. No private key
for the Safe exists anywhere — not in a browser, not on 1Claw's servers, not
in any HSM. Verified against the real implementation, not docs or memory:
`vault/src/api/handlers/passkey_safes.rs`, `vault/migrations/263_passkey_safes.sql`.

## How it actually works

- The Safe's sole owner is Safe's shared WebAuthn signer module
  (`SafeWebAuthnSharedSigner`), configured with your passkey's P-256 public
  key. Signing a transaction *is* touching your passkey — the challenge it
  signs is the transaction's own `SafeTx` hash.
- 1Claw computes that hash, screens the call against your normal spend
  guardrails, verifies the resulting WebAuthn assertion itself before
  relaying anything (a bad signature is rejected here, not by the chain),
  wraps it in Safe's contract-signature format, and relays
  `execTransaction` — plus the one-time proxy deployment — from your
  server-custody EVM treasury wallet, which pays gas and cannot move the
  Safe's funds on its own.
- The Safe's address is counterfactual (CREATE2-derived) until the first
  transaction deploys it.
- **Agents can spend from it too, without a passkey touch per transaction** —
  once you grant one an allowance (via the Safe's on-chain Allowance
  Module, itself enabled by one passkey signature), the agent spends
  against that allowance with its own server-custody ECDSA key. That half
  is fully scriptable and is what `client.agents.spendFromPasskeySafe()`
  wraps.

## What this example actually runs vs. explains

**Registering the passkey itself cannot run headless, and this example does
not fake it.** WebAuthn ceremonies are cryptographically bound by the
*browser* to the exact origin performing them (`https://1claw.co`) — that
binding is the entire non-custodial guarantee, so there is deliberately no
API shortcut around it. This example was built after a real attempt to drive
the ceremony with a genuine Chrome DevTools Protocol virtual authenticator
(the same technique the `browser-bridge` example in this repo uses) against
the real dashboard login + Settings → Security → Add passkey flow — it got
through real login and real navigation, but the registration mutation itself
didn't complete cleanly in that environment. That's an honest result, not a
workaround to paper over.

So, running `npm start`:

1. **Real, live**: exchanges your `1ck_` key for a session, lists your
   existing passkeys and Safes (`GET /v1/auth/passkeys`,
   `GET /v1/treasury/passkey-safes`).
2. **If you have no passkey yet** (a fresh account will not): explains
   exactly why and stops there — register one via the dashboard
   (Settings → Security → Add passkey), then re-run.
3. **If you do have a passkey**: creates a real Safe owned by it
   (`POST /v1/treasury/passkey-safes`), then calls `/prepare` on a no-op
   transaction to show the real `safe_tx_hash` — the actual value a browser
   would sign as the WebAuthn challenge. It stops before `/execute`, since
   producing a real assertion needs that same real-origin browser ceremony.
4. **Always**: prints the exact, real `client.agents.spendFromPasskeySafe()`
   call for the agent-spend half, which needs no passkey touch once a grant
   exists.

## A gap found while building this

`@1claw/sdk` wraps `agents.spendFromPasskeySafe()` but has **no resource at
all** for the human-owner side — create/list/prepare/execute/grants. This
example calls those directly with `fetch()` (matching `/v1/auth/api-key-token`,
the exact exchange endpoint the SDK itself uses internally for a `1ck_` key)
rather than through an SDK wrapper that doesn't exist yet.

## Quick start

```bash
cd examples/passkey-safe
npm install
cp .env.example .env
# Edit .env: ONECLAW_API_KEY=1ck_... (a HUMAN key — https://1claw.co/settings/api-keys)
npm start
```
