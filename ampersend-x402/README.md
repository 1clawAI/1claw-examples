# 1Claw + Ampersend x402 Payments

> **Reference only** — not for production use. Review and adapt for your own security requirements.

**Difficulty: Advanced**

This example shows how [1Claw](https://1claw.xyz) (secrets + API access) and [Ampersend](https://ampersend.ai) (x402 payment authorization + wallet signing) work together so an AI agent can call paid APIs without storing payment keys in the environment.

When the agent hits a **402 Payment Required**, Ampersend's treasurer authorizes the payment, the smart account signs it, and the request retries automatically. The payment session key can come from an environment variable (Option A) or from a 1Claw vault (Option B).

## What you'll learn

- Wrap `fetch()` with automatic x402 payment handling
- Connect an MCP client to 1Claw's MCP server with payment support
- Build a hybrid billing strategy (1Claw credits first, then on-chain x402)
- Run a standalone x402 paywall server and client
- Store payment keys securely in 1Claw instead of environment variables

## How 1Claw and Ampersend work together

| Concern | 1Claw | Ampersend |
|---------|-------|-----------|
| Identity / auth for API calls | JWT from API key + agent ID | — |
| Where the payment key lives | Vault (Option B) or env (Option A) | — |
| Deciding whether to pay | — | AmpersendTreasurer + Ampersend API |
| Signing the payment | — | SmartAccountWallet (session key) |
| Who returns 402 | 1Claw API/MCP when over quota | Any x402 server |
| Verifying payment on-chain | 1Claw uses a facilitator | Paywall uses Coinbase CDP |

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key, vault, and agent
- A smart account address (for Ampersend — see [Ampersend docs](https://docs.ampersend.ai))
- For the paywall demo: [Coinbase CDP credentials](https://portal.cdp.coinbase.com/)
- Build the SDK first: `cd packages/sdk && npm run build && cd ../..`

## Demo walkthrough (10 min)

### Step 1 — Install and configure

```bash
cd examples/ampersend-x402
npm install
cp .env.example .env
```

Open `.env` and fill in the required credentials:

```env
# 1Claw (required for all demos)
ONECLAW_API_KEY=ocv_your_key_here
ONECLAW_VAULT_ID=your-vault-uuid
ONECLAW_AGENT_ID=your-agent-uuid

# Wallet (Option A: key in env)
BUYER_PRIVATE_KEY=0x_your_session_key
SMART_ACCOUNT_ADDRESS=0x_your_smart_account
```

### Step 2 — Run the HTTP client demo

```bash
npm run http
```

This runs `src/http-with-payments.ts`, which:

1. Authenticates with 1Claw (exchanges API key + agent ID for a JWT)
2. Resolves the session key (from env or vault)
3. Sets up Ampersend treasurer and payment-wrapped `fetch()`
4. Calls the 1Claw API — if over quota, the 402 is handled automatically

**Expected output:**

```
=== 1Claw HTTP + x402 Demo ===

Authenticating with 1Claw...  ✓ JWT acquired
Resolving session key...      ✓ Using env key (Option A)
Setting up Ampersend...       ✓ Treasurer and wallet ready

Fetching secrets from vault...
  Status: 200
  Secrets: [demo/api-key (api_key, v1)]
```

### Step 3 — Run the MCP client demo

```bash
npm start
```

This runs `src/mcp-with-payments.ts`, which connects to the hosted 1Claw MCP server with automatic x402 payment handling on every tool call.

### Step 4 — Run the hybrid billing demo

```bash
npm run hybrid
```

This runs `src/custom-treasurer.ts`, which checks your 1Claw **prepaid credit balance** first. If credits are sufficient, it uses them. If not, it delegates to Ampersend for on-chain payment.

### Step 5 — (Optional) Run the paywall server + client

In one terminal:

```bash
npm run server    # Paywall on :4021
```

In another terminal:

```bash
npm run client    # Pays $0.001 USDC and gets a joke
```

The server returns 402 on `/protected/joke`. The client pays via x402 and gets the content.

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npm run http` | `src/http-with-payments.ts` | HTTP client with 1Claw API + x402 |
| `npm start` | `src/mcp-with-payments.ts` | MCP client with 1Claw MCP + x402 |
| `npm run hybrid` | `src/custom-treasurer.ts` | Hybrid: 1Claw credits then on-chain x402 |
| `npm run server` | `src/x402-server.ts` | Standalone paywall ($0.001 USDC, CDP) |
| `npm run client` | `src/x402-client.ts` | Paywall client (x402 v2, smart account) |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | 1Claw API key (`ocv_...`) |
| `ONECLAW_VAULT_ID` | Yes | Vault UUID |
| `ONECLAW_AGENT_ID` | MCP | Agent UUID (required for MCP, optional for HTTP) |
| `BUYER_PRIVATE_KEY` | Yes* | Session key (`0x...`). *Omit for Option B (key from vault).* |
| `SMART_ACCOUNT_ADDRESS` | Yes* | Smart account address. *Required for HTTP, MCP, hybrid.* |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |
| `BUYER_KEY_PATH` | No | Vault path for session key in Option B (default: `keys/x402-session-key`) |
| `CDP_API_KEY_ID` | Server | Coinbase CDP key ID |
| `CDP_API_KEY_SECRET` | Server | Coinbase CDP key secret |
| `X402_PAY_TO_ADDRESS` | Server | Recipient address for paywall payments |

## How it works

```
Your App                         1Claw API                    Ampersend
   │                                │                            │
   │  POST /v1/auth/agent-token     │                            │
   │ ──────────────────────────────►│                            │
   │ ◄────────────────────────────── JWT                        │
   │                                │                            │
   │  GET /v1/vaults/{id}/secrets   │                            │
   │ ──────────────────────────────►│                            │
   │ ◄────────────────────────────── 402 Payment Required       │
   │                                │                            │
   │  treasurer.onPaymentRequired() │                            │
   │ ──────────────────────────────────────────────────────────►│
   │     Ampersend API: authorize?   │                           │
   │     SmartAccountWallet: sign    │                           │
   │ ◄──────────────────────────────────────────────────────────│
   │     Authorization { payment }   │                           │
   │                                │                            │
   │  GET /v1/vaults/{id}/secrets   │                            │
   │  + X-Payment header            │                            │
   │ ──────────────────────────────►│                            │
   │ ◄────────────────────────────── 200 OK                     │
```

## Key code patterns

**Authenticate and resolve session key:**

```typescript
import { createClient } from "@1claw/sdk";
import { resolveBuyerKey } from "./resolve-buyer-key.js";

const sdk = createClient({ baseUrl: "https://api.1claw.xyz" });
await sdk.auth.agentToken({ api_key: API_KEY, agent_id: AGENT_ID });

const sessionKey = await resolveBuyerKey({
  apiKey: API_KEY, vaultId: VAULT_ID,
  baseUrl: "https://api.1claw.xyz",
});
```

**Set up payment-wrapped fetch:**

```typescript
import { createAmpersendTreasurer, wrapWithAmpersend } from "@ampersend_ai/ampersend-sdk";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";

const treasurer = createAmpersendTreasurer({
  smartAccountAddress: "0x...",
  sessionKeyPrivateKey: sessionKey,
  chainId: 8453,
});
const client = new x402Client();
wrapWithAmpersend(client, treasurer, ["base"]);
const paymentFetch = wrapFetchWithPayment(fetch, client);

// Now every 402 is handled automatically
const res = await paymentFetch("https://api.1claw.xyz/v1/vaults/.../secrets", {
  headers: { Authorization: `Bearer ${jwt}` },
});
```

## Wallet safety

- Use a **session key** for x402, not your main wallet
- Fund the smart account only with what you need for testing
- AmpersendTreasurer enforces spending limits via the Ampersend Platform

## Next steps

- [Basic Examples](../basic/) — Core SDK flows without payment complexity
- [Transaction Simulation](../tx-simulation/) — On-chain transactions with guardrails
- [1Claw Docs](https://docs.1claw.xyz) · [Ampersend Docs](https://docs.ampersend.ai) · [x402 Spec](https://x402.org)
