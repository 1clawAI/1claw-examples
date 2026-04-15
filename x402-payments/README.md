# 1Claw x402 Payments Example

> **Reference only** — not for production use. Review and adapt for your own security requirements.

This example demonstrates **real x402 micropayments** against the 1Claw API. When your org is over the free-tier quota (or you have no auth), payable endpoints return `402 Payment Required`. This script uses an EOA private key from `.env` to sign payments and retry, so you can call every x402-capable endpoint with automatic payment.

## Quick start

```bash
cd examples/x402-payments
npm install
cp .env.example .env
# Edit .env:
#   ONECLAW_API_KEY, ONECLAW_VAULT_ID (from https://1claw.xyz)
#   X402_PRIVATE_KEY=0x... (generate with: node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))")
# For real payments: fund the wallet with USDC on Base (chain 8453)
npm start
```

The script authenticates with 1Claw, then calls get/put secret, audit, and optionally simulate. If the API returns 402, it signs the payment and retries with the `X-PAYMENT` header.

**Probe only (no on-chain payment key):** `npm run probe`

From the repo root: `cd examples && npm run bootstrap` copies `.env.example` → `.env` when missing.

## What you'll learn

- Authenticate with 1Claw and call x402-capable endpoints (secrets, audit, simulate)
- Handle **402 Payment Required** by signing with an EOA key and retrying with the `X-PAYMENT` header
- Use the `@x402/evm` client with 1Claw's facilitator (Coinbase CDP on Base)
- Run a **probe-only** mode (no payment key) to verify 402 behavior

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key and vault
- For real payments: an EOA private key with **USDC on Base** (chain 8453)

## Demo walkthrough (5 min)

### Step 1 — Install and configure

```bash
cd examples/x402-payments
npm install
cp .env.example .env
```

Set `ONECLAW_API_KEY` and `ONECLAW_VAULT_ID` from [1claw.xyz](https://1claw.xyz). For **probe only** (see 402 without paying), leave `X402_PRIVATE_KEY` unset and run `npm run probe`.

### Step 2 — Generate an EOA key (for real payments)

```bash
node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))"
```

Add the output as `X402_PRIVATE_KEY=0x...` in `.env`. For real payments when over quota, fund this wallet with USDC on Base.

### Step 3 — Run the demo

```bash
npm start
```

**Expected behavior:** The script authenticates, then hits x402-capable endpoints (get/put secret, audit, optionally simulate). For each request that returns **402**, it signs the payment and retries with `X-PAYMENT`; you see either **200 OK** or **402** (e.g. if the facilitator or key isn't set up).

**Probe only (no payment key):**

```bash
npm run probe
```

Performs GET requests and prints status codes so you can confirm 402 when payment is required.

## x402-capable endpoints (1Claw)

| Method | Path                                                 | Description          |
| ------ | ---------------------------------------------------- | -------------------- |
| GET    | `/v1/vaults/{vault_id}/secrets/{path}`               | Read secret          |
| PUT    | `/v1/vaults/{vault_id}/secrets/{path}`               | Write secret         |
| POST   | `/v1/secrets/{secret_id}/share`                      | Create share         |
| GET    | `/v1/share/{share_id}`                               | Access share         |
| GET    | `/v1/audit/events`                                   | Audit log            |
| POST   | `/v1/agents/{agent_id}/transactions`                 | Submit transaction   |
| POST   | `/v1/agents/{agent_id}/transactions/simulate`        | Simulate transaction |
| POST   | `/v1/agents/{agent_id}/transactions/simulate-bundle` | Simulate bundle      |

## Setup (detailed)

1. **Copy env and set 1Claw credentials:** `ONECLAW_API_KEY`, `ONECLAW_VAULT_ID`. Optional: `ONECLAW_AGENT_ID` for Intents demos.

2. **Generate an EOA key for x402:** Run `node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))"` and set `X402_PRIVATE_KEY=0x...` in `.env`. For **real** payments when over quota, this wallet must hold **USDC on Base** (chain ID 8453); 1Claw uses the Coinbase CDP x402 facilitator.

3. **Install and run:** `npm install` then `npm start`.

## What the script does

- Authenticates with 1Claw (API key or agent token).
- Builds an x402 client with `@x402/evm` **exact** scheme and your `X402_PRIVATE_KEY` as the signer (EOA on Base).
- Calls a set of x402-capable endpoints (get/put secret, audit events, and optionally agent simulate).
- For each request: if the API returns **402**, the client signs the payment and retries with the `X-PAYMENT` header; you see either **200 OK** or **402** (e.g. if the facilitator or key isn’t set up for payment).

## Probe only (no payment key)

To only check that endpoints return **402** when payment is required (e.g. unauthenticated or over quota), run:

```bash
npm run probe
```

No `X402_PRIVATE_KEY` needed; it only performs GET requests and prints status codes.

## Optional: share and agent

- **GET /v1/share/{share_id}**: Add `ONECLAW_SHARE_ID` to `.env` to include this in the demo.
- **Agent endpoints**: Set `ONECLAW_AGENT_ID` to include transaction simulate in the demo.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | 1Claw API key from [1claw.xyz/settings/api-keys](https://1claw.xyz/settings/api-keys) |
| `ONECLAW_VAULT_ID` | Yes | Vault UUID from the [dashboard](https://1claw.xyz) |
| `X402_PRIVATE_KEY` | For payment | EOA private key (hex). Must hold USDC on Base for real payments. |
| `ONECLAW_AGENT_ID` | Optional | For transaction simulate in the demo |
| `ONECLAW_BASE_URL` | No | Default: `https://api.1claw.xyz` |

## References

- [1Claw billing & x402](https://docs.1claw.xyz/guides/billing-and-usage)
- [x402 protocol](https://docs.x402.org/)
- [Coinbase CDP x402 facilitator](https://docs.cdp.coinbase.com/)
