# 1Claw + Ampersend x402 Payments

> **Warning — Not for production use.** This example is for reference and learning only.

**Difficulty: Advanced**

Budget-controlled [x402](https://x402.org) micropayments for API access using the [Ampersend SDK](https://github.com/edgeandnode/ampersend-sdk) and the [x402 protocol](https://github.com/coinbase/x402). When an agent exceeds its free-tier quota, x402 handles payment authorization and wallet signing so API calls continue seamlessly.

Supports both **EOA wallets** and **smart accounts** (ERC-4337 / Safe with ERC-1271 signatures).

## Examples

| Script | Description |
|--------|-------------|
| `src/mcp-with-payments.ts` | MCP client with automatic x402 payment handling |
| `src/http-with-payments.ts` | Wraps `fetch()` with x402 payment layer for REST API calls |
| `src/custom-treasurer.ts` | Hybrid billing: 1Claw credits first, x402 on-chain fallback |
| `src/x402-server.ts` | Express server with a $0.001 USDC paywall (Coinbase CDP facilitator) |
| `src/x402-client.ts` | Client that pays the paywall using a smart account |

## Architecture

```
┌─────────┐     GET /secrets     ┌────────────┐
│  Agent   │ ──────────────────► │  1Claw API │
│          │ ◄─── 402 Payment ── │            │
│          │      Required       └────────────┘
│          │
│ Ampersend│ ── sign USDC ──► Base (on-chain)
│  Layer   │
│          │     GET /secrets
│          │ ──────────────────► ┌────────────┐
│          │  + PAYMENT header   │  1Claw API │
│          │ ◄─── 200 OK ────── │            │
└─────────┘                      └────────────┘
```

## Quick start

```bash
cd examples/ampersend-x402
npm install
cp .env.example .env
# Fill in your keys (see Environment Variables below)
npm start          # MCP client
npm run http       # HTTP client
npm run hybrid     # Hybrid billing
```

### x402 paywall demo (server + client)

```bash
npm run server     # starts paywall on :4021
npm run client     # pays $0.001 USDC and gets a joke
```

## Project structure

```
src/
├── resolve-buyer-key.ts    # Resolves session key from env or 1Claw vault
├── http-with-payments.ts   # HTTP client + Ampersend x402 (v1)
├── mcp-with-payments.ts    # MCP client + Ampersend x402 (v1)
├── custom-treasurer.ts     # Hybrid credits/x402 treasurer
├── x402-server.ts          # Express paywall server (v2, CDP facilitator)
└── x402-client.ts          # x402 v2 client with smart account signing
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BUYER_PRIVATE_KEY` | Yes* | Session key for x402 payments (`0x...`). *Or store in vault — see Option B.* |
| `SMART_ACCOUNT_ADDRESS` | No | Smart account address if buyer key is a session key signer |
| `ONECLAW_API_KEY` | Yes | 1Claw API key (`ocv_...`) |
| `ONECLAW_VAULT_ID` | Yes | Vault UUID |
| `ONECLAW_AGENT_ID` | MCP | Agent UUID (required for MCP, optional otherwise) |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |
| `CDP_API_KEY_ID` | Server | Coinbase CDP API key ID (for x402 server demo) |
| `CDP_API_KEY_SECRET` | Server | Coinbase CDP API key secret |
| `X402_PAY_TO_ADDRESS` | Server | Address to receive x402 payments |

## Key patterns demonstrated

- **x402 payment wrapping** — `wrapFetchWithPayment()` intercepts 402 responses, signs payment, retries
- **Smart account signing** — ERC-1271 signatures via `@rhinestone/module-sdk` OwnableValidator
- **Hybrid billing** — Check off-chain credits before authorizing on-chain payment
- **Key bootstrapping** — Fetch session key from 1Claw vault instead of env vars
- **CDP facilitator auth** — Ed25519 JWT signing for Coinbase x402 facilitator

## Wallet safety

- **Use a session key** — never put your main wallet's private key in env vars
- **Fund minimally** — only load enough USDC for testing
- **NaiveTreasurer** approves all payments — use spend-limited logic in production
- The `HybridTreasurer` shows how to add custom authorization logic

## See also

- [x402 specification](https://x402.org)
- [Ampersend SDK](https://github.com/edgeandnode/ampersend-sdk)
- [Coinbase CDP](https://portal.cdp.coinbase.com/)
- [1Claw docs](https://docs.1claw.xyz)
