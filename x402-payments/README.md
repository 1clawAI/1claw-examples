# 1Claw x402 payments example

This example demonstrates **real x402 micropayments** against the 1Claw API. When your org is over the free-tier quota (or you have no auth), payable endpoints return `402 Payment Required`. This script uses an EOA private key from `.env` to sign payments and retry, so you can call every x402-capable endpoint with automatic payment.

## x402-capable endpoints (1Claw)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/vaults/{vault_id}/secrets/{path}` | Read secret |
| PUT | `/v1/vaults/{vault_id}/secrets/{path}` | Write secret |
| POST | `/v1/secrets/{secret_id}/share` | Create share |
| GET | `/v1/share/{share_id}` | Access share |
| GET | `/v1/audit/events` | Audit log |
| POST | `/v1/agents/{agent_id}/transactions` | Submit transaction |
| POST | `/v1/agents/{agent_id}/transactions/simulate` | Simulate transaction |
| POST | `/v1/agents/{agent_id}/transactions/simulate-bundle` | Simulate bundle |

## Setup

1. **Copy env and set 1Claw credentials**

   ```bash
   cp .env.example .env
   # Set ONECLAW_API_KEY, ONECLAW_VAULT_ID (and ONECLAW_AGENT_ID for Intents demos)
   ```

2. **Generate a key for x402 payments and add to `.env`**

   Generate a new EOA private key (hex, 32 bytes):

   ```bash
   node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"
   ```

   Put the result in `.env` as `X402_PRIVATE_KEY=0x...`.

   For **real** payments when over quota, this wallet must hold **USDC on Base** (chain ID 8453). The 1Claw API uses the Coinbase CDP x402 facilitator; payments are in USDC on Base.

3. **Install and run**

   ```bash
   npm install
   npm start
   ```

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

## References

- [1Claw billing & x402](https://docs.1claw.xyz/guides/billing-and-usage)
- [x402 protocol](https://docs.x402.org/)
- [Coinbase CDP x402 facilitator](https://docs.cdp.coinbase.com/)
