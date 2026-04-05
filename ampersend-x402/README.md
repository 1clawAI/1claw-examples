# 1Claw + Ampersend x402 Payments

> **Reference only** — not for production use. Review and adapt for your own security requirements.

**Difficulty: Advanced**

This example shows how [1Claw](https://1claw.xyz) (secrets management) and [Ampersend](https://ampersend.ai) (x402 smart-account payments) work together so an AI agent can call paid APIs without ever storing payment keys in the environment.

An x402 paywall server charges $0.001 USDC per request on Base mainnet. When the client hits **402 Payment Required**, Ampersend's SDK signs the payment through a smart account (ERC-6492), and a local facilitator settles it on-chain. The session key lives in a 1Claw vault — never in `.env`.

## What you'll learn

- Run a local x402 paywall server with a facilitator that supports smart-account signatures
- Sign payments via Ampersend's smart-account SDK (no manual EIP-1271 needed)
- Store payment keys securely in 1Claw instead of environment variables
- Automate vault, agent, and policy setup with the 1Claw SDK

## How 1Claw and Ampersend work together

| Concern | 1Claw | Ampersend |
|---------|-------|-----------|
| Where the session key lives | Vault (fetched at runtime) | — |
| Signing the payment | — | Smart account (ERC-6492 via Ampersend API) |
| Settling on-chain | Local facilitator (EOA with gas) | — |
| Who returns 402 | x402 paywall server | — |

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key, vault, and agent
- An [Ampersend smart account](https://docs.ampersend.ai) with a registered session key
- ~$0.01 ETH on Base in the facilitator wallet (for gas)
- USDC on Base in the smart account (for payments)

## Quick start

```bash
cd examples/ampersend-x402
npm install
cp .env.example .env
# Edit .env — see below
npm start
```

### Required `.env` values

```env
ONECLAW_API_KEY=ocv_...          # Agent API key
ONECLAW_VAULT_ID=...             # Vault UUID
ONECLAW_AGENT_ID=...             # Agent UUID
SMART_ACCOUNT_ADDRESS=0x...      # Ampersend smart account
X402_PAY_TO_ADDRESS=0x...        # Wallet that receives USDC payments
```

The session key is fetched from the vault at `keys/x402-session-key` automatically. You can override this with `BUYER_PRIVATE_KEY` in `.env`.

### Expected output

```
Starting x402 server…

x402 paywall server running on http://localhost:4021
Facilitator: Local (0x7d3...)
Pay-to:      0x2B6...

Running x402 client…

=== x402 Client (Ampersend + 1Claw) ===

Smart account: 0x2B623dbEA5f0C4e06444d0431a6d5167f3258Abc
Session key:   0x7d34af134Ee5AFA0eb97F48Bec5bfbdd003F92cC
Server:        http://localhost:4021/joke

USDC on Base: 1 USDC

Status: 200

Response: {
  "joke": "A SQL query walks into a bar, sees two tables, and asks… 'Can I JOIN you?'",
  "price": "$0.001 USDC on Base",
  "paid": true
}

Payment successful!
```

## Automated setup

Use a **human** API key (`1ck_...`) from [Settings → API Keys](https://1claw.xyz/settings/api-keys) to create the vault, agent, policies, and store the session key automatically:

```bash
npm run setup
# Prompts for 1ck_ user key and session key (or generates one)
```

The script is idempotent: it creates or reuses a vault `ampersend-x402-demo` and agent `ampersend-x402-agent`, grants read on `keys/**`, stores the session key, and prints a `.env` block.

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npm start` | `src/run-paywall-demo.ts` | Start server + client end-to-end |
| `npm run paywall` | `src/run-paywall-demo.ts` | Same as `npm start` |
| `npm run server` | `src/x402-server.ts` | Start the paywall server only |
| `npm run client` | `src/x402-client.ts` | Run the payment client only |
| `npm run setup` | `src/setup-ampersend.ts` | One-time vault/agent/policy setup |

## Architecture

```
x402-server.ts          x402-client.ts
┌──────────────┐        ┌──────────────────────┐
│ Express app  │        │ Ampersend SDK        │
│ + paywall    │◄──────►│ (smart account sign) │
│ middleware   │  402   │                      │
│              │◄──────►│ @x402/fetch          │
│ Local x402   │ pay +  │ (payment retry)      │
│ facilitator  │ verify │                      │
│ (on-chain    │        │ resolve-buyer-key.ts │
│  settlement) │        │ (1Claw vault fetch)  │
└──────────────┘        └──────────────────────┘
       │                         │
       ▼                         ▼
   Base mainnet             1Claw Vault
   (USDC transfer)       (session key)
```

### Payment flow

1. Client GETs `/joke` → server returns **402 Payment Required**
2. Ampersend SDK calls its API to authorize the payment
3. Smart account signs `transferWithAuthorization` (ERC-6492 signature)
4. Client retries with `payment-signature` header
5. Local facilitator verifies the signature and settles on-chain
6. Server returns the joke (200 OK)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Agent API key (`ocv_...`) |
| `ONECLAW_VAULT_ID` | Yes | Vault UUID |
| `ONECLAW_AGENT_ID` | Yes | Agent UUID |
| `SMART_ACCOUNT_ADDRESS` | Yes | Ampersend smart account address |
| `X402_PAY_TO_ADDRESS` | Yes | Wallet receiving USDC payments |
| `BUYER_PRIVATE_KEY` | No | Session key (`0x...`); if unset, fetched from vault |
| `BUYER_KEY_PATH` | No | Vault path for session key (default: `keys/x402-session-key`) |
| `X402_FACILITATOR_KEY` | No | Facilitator EOA key; if unset, uses session key from vault |
| `AMPERSEND_API_URL` | No | Ampersend API (default: `https://api.ampersend.ai`) |
| `ONECLAW_BASE_URL` | No | 1Claw API URL (default: `https://api.1claw.xyz`) |
| `X402_SERVER_PORT` | No | Paywall server port (default: `4021`) |
| `BASE_RPC_URL` | No | Base RPC endpoint for balance checks and facilitator settle |
| `X402_CLIENT_DEBUG` | No | Set to `1` for verbose x402 fetch logging |

## Debugging

Set `X402_CLIENT_DEBUG=1` to log every fetch, decode `PAYMENT-REQUIRED` and `payment-signature` headers, and show facilitator verify/settle responses.

```bash
X402_CLIENT_DEBUG=1 npm start
```

If `PAYMENT-RESPONSE` shows `invalid_exact_evm_transaction_failed` with an empty `transaction` hash, the facilitator EOA (printed at server startup) has no Base ETH for gas. Fund it with a small amount of ETH — the payer smart-account USDC does **not** cover facilitator gas. The server warns at startup when facilitator ETH is zero or very low.

## Wallet safety

- Use a **session key** for x402, not your main wallet
- Fund the smart account only with what you need for testing
- The facilitator wallet only needs ETH for gas — it never holds user funds

## Next steps

- [Basic Examples](../basic/) — Core SDK flows without payment complexity
- [Transaction Simulation](../tx-simulation/) — On-chain transactions with guardrails
- [1Claw Docs](https://docs.1claw.xyz) · [Ampersend Docs](https://docs.ampersend.ai) · [x402 Spec](https://x402.org)
