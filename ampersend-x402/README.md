# 1Claw + Ampersend x402 Payments

> **Warning — Not for production use.** This example is for reference and learning only.

**Difficulty: Advanced**

This example shows how **[1Claw](https://1claw.xyz)** (secrets and API access) and **[Ampersend](https://ampersend.ai)** (x402 payment authorization and wallet signing) work together so an agent can call paid APIs and MCP servers without storing payment keys in the environment. When the agent hits a 402 Payment Required, Ampersend’s treasurer approves the payment and the smart account signs it; 1Claw can also supply the session key from a vault (Option B).

## What is 1Claw?

1Claw is an HSM-backed secrets manager for AI agents and humans. In this example it provides:

- **Authentication** — Exchange `ONECLAW_API_KEY` + `ONECLAW_AGENT_ID` for a JWT to call the 1Claw API and MCP server.
- **Secrets and vaults** — Store and retrieve secrets (e.g. the x402 session key) so the agent doesn’t need `BUYER_PRIVATE_KEY` in env (Option B).
- **Billing and quota** — Subscription tiers, prepaid credits, and (when quota is exceeded) 402 responses that trigger x402 payment.
- **MCP server** — Tools like `list_secrets`, `get_secret`, `put_secret` over HTTP, with 402 when over quota.

So 1Claw is both the *paid service* (you call its API/MCP and may get 402) and the *source of the payment key* when using Option B.

## What is Ampersend?

Ampersend provides the [x402](https://x402.org) payment layer so your agent can *pay* when it receives 402. In this example it provides:

- **AmpersendTreasurer** — Asks the Ampersend API whether to authorize a payment, enforces spending limits, and reports payment events. Required when your agent is registered on the [Ampersend Platform](https://docs.ampersend.ai/sdk/sdk-architecture-primitives).
- **SmartAccountWallet** — Builds and signs x402 payment payloads using a smart account (ERC-4337 / Safe) and a session key (ERC-1271 via Rhinestone’s OwnableValidator).
- **Client integration** — `wrapWithAmpersend()` plus `wrapFetchWithPayment()` so a normal `fetch()` is wrapped: on 402, the treasurer approves, the wallet signs, and the request is retried with a payment header.

So Ampersend handles *whether* to pay and *how* to sign; it does not hold your secrets — the session key comes from your env (Option A) or from 1Claw (Option B).

## How they work together

| Concern | 1Claw | Ampersend |
|--------|--------|-----------|
| Identity / auth for API calls | JWT from API key + agent ID | — |
| Where the payment key lives | Vault (Option B) or you use env (Option A) | — |
| Deciding to pay (limits, policy) | — | AmpersendTreasurer + Ampersend API |
| Signing the payment | — | SmartAccountWallet (session key + smart account) |
| Who returns 402 | 1Claw API / MCP when over quota | Any x402 server (e.g. paywall demo) |
| Verifying/settling payment on-chain | 1Claw uses a facilitator | Paywall demo uses Coinbase CDP |

The flow: your app authenticates with 1Claw and (if using Option B) fetches the session key from a 1Claw vault. It then uses that key with Ampersend’s treasurer and wallet. When a request (to 1Claw or another x402 server) returns 402, Ampersend’s layer authorizes and signs the payment, and the client retries with the payment header.

---

## Transaction flow (1Claw API + x402)

When your agent calls the 1Claw API (or MCP) and is over quota, the following flow runs. The same pattern applies to any x402 server; the paywall demo (`x402-server` + `x402-client`) uses a separate server and Coinbase CDP instead of 1Claw.

```
┌──────────────┐                    ┌─────────────┐                    ┌──────────────────┐
│   Your app   │                    │   1Claw     │                    │    Ampersend     │
│  (agent)     │                    │   API       │                    │  (treasurer +    │
│              │                    │             │                    │   wallet)        │
└──────┬───────┘                    └──────┬──────┘                    └────────┬─────────┘
       │                                   │                                    │
       │  1. Auth: POST /v1/auth/agent-token (api_key, agent_id)                │
       │ ─────────────────────────────────►                                    │
       │ ◄───────────────────────────────── JWT                                │
       │                                   │                                    │
       │  2. (Option B) GET secret at path keys/x402-session-key (SDK: secrets.get)
       │     Authorization: Bearer JWT     │                                    │
       │ ─────────────────────────────────►                                    │
       │ ◄───────────────────────────────── session key (value)                │
       │                                   │                                    │
       │  3. GET /v1/vaults/{id}/secrets   │                                    │
       │     Authorization: Bearer JWT     │                                    │
       │ ─────────────────────────────────►                                    │
       │ ◄───────────────────────────────── 402 Payment Required               │
       │     X-Payment-Required: {...}      │                                    │
       │                                   │                                    │
       │  4. SDK calls treasurer.onPaymentRequired(requirements)                │
       │ ────────────────────────────────────────────────────────────────────►  │
       │     (A) Ampersend API: authorize? limits? …                             │
       │     (B) If OK → wallet.createPayment() (Smart Account signs)           │
       │ ◄────────────────────────────────────────────────────────────────────  │
       │     Authorization { payment, id } (signed payload)                     │
       │                                   │                                    │
       │  5. GET /v1/vaults/{id}/secrets   │                                    │
       │     Authorization: Bearer JWT     │                                    │
       │     X-Payment: <signed payload>    │                                    │
       │ ─────────────────────────────────►                                    │
       │     (1Claw or facilitator verifies/settles on-chain)                    │
       │ ◄───────────────────────────────── 200 OK + body                      │
       │                                   │                                    │
```

Steps 4–5: The Ampersend SDK calls `AmpersendTreasurer.onPaymentRequired`; the treasurer asks the Ampersend API to authorize, then (if authorized) has `SmartAccountWallet` sign the payment and returns the `Authorization` to the SDK. Your code uses a payment-wrapped `fetch`; the retry with `X-Payment` happens automatically.

---

## Examples

| Script | Description |
|--------|-------------|
| `src/mcp-with-payments.ts` | MCP client: connects to 1Claw MCP, x402 handled automatically |
| `src/http-with-payments.ts` | HTTP client: wraps `fetch()` with x402 for REST (e.g. 1Claw API) |
| `src/custom-treasurer.ts` | Hybrid: check 1Claw credits first, then AmpersendTreasurer for on-chain payment |
| `src/x402-server.ts` | Standalone paywall server ($0.001 USDC, Coinbase CDP facilitator) |
| `src/x402-client.ts` | Client for the paywall demo (x402 v2, smart account, Option A or B) |

---

## Quick start

```bash
cd examples/ampersend-x402
npm install
cp .env.example .env
# Fill in ONECLAW_* and SMART_ACCOUNT_ADDRESS (see Environment Variables)
npm run http    # HTTP client (1Claw API + x402)
npm start       # MCP client (1Claw MCP + x402)
npm run hybrid  # Hybrid billing (credits then x402)
```

### Paywall demo (server + client)

```bash
npm run server   # Paywall on :4021 (needs CDP_API_KEY_* and X402_PAY_TO_ADDRESS)
npm run client   # Pays $0.001 USDC and gets a joke (Option A or B for key)
```

---

## Code snippets

### 1. Authenticate with 1Claw and resolve the session key (Option A or B)

```typescript
import { createClient } from "@1claw/sdk";
import { resolveBuyerKey } from "./resolve-buyer-key.js";

const sdk = createClient({ baseUrl: process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz" });
const authRes = await sdk.auth.agentToken({
    api_key: process.env.ONECLAW_API_KEY!,
    agent_id: process.env.ONECLAW_AGENT_ID!,
});
if (authRes.error) throw new Error(authRes.error.message);
const JWT = authRes.data!.access_token;

// Session key: from env (Option A) or from 1Claw vault at BUYER_KEY_PATH (Option B)
const sessionKey = await resolveBuyerKey({
    apiKey: process.env.ONECLAW_API_KEY!,
    vaultId: process.env.ONECLAW_VAULT_ID!,
    baseUrl: process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz",
    agentId: process.env.ONECLAW_AGENT_ID,
});
```

### 2. Ampersend treasurer + payment-wrapped fetch

```typescript
import { createAmpersendTreasurer, wrapWithAmpersend } from "@ampersend_ai/ampersend-sdk";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";

const treasurer = createAmpersendTreasurer({
    smartAccountAddress: process.env.SMART_ACCOUNT_ADDRESS! as `0x${string}`,
    sessionKeyPrivateKey: sessionKey,
    chainId: 8453, // Base mainnet
});
const client = new x402Client();
wrapWithAmpersend(client, treasurer, ["base"]);
const paymentFetch = wrapFetchWithPayment(fetch, client);
```

### 3. Call 1Claw API with automatic 402 handling

```typescript
const res = await paymentFetch(`https://api.1claw.xyz/v1/vaults/${VAULT_ID}/secrets`, {
    headers: {
        Authorization: `Bearer ${JWT}`,
        "Content-Type": "application/json",
    },
});
// If over quota: 402 → treasurer approves → wallet signs → retry with X-Payment → 200
```

### 4. Hybrid: 1Claw credits first, then Ampersend for on-chain payment

```typescript
import { createAmpersendTreasurer, wrapWithAmpersend } from "@ampersend_ai/ampersend-sdk";
import type { X402Treasurer } from "@ampersend_ai/ampersend-sdk";

const ampersendTreasurer = createAmpersendTreasurer({
    smartAccountAddress: SMART_ACCOUNT as `0x${string}`,
    sessionKeyPrivateKey: PRIVATE_KEY,
    chainId: 8453,
});

// Wrap: check 1Claw credit balance first; if low, delegate to Ampersend to sign
class HybridTreasurer implements X402Treasurer {
    constructor(private delegate: X402Treasurer, private creditThresholdCents = 100) {}
    async onPaymentRequired(requirements, context) {
        const balanceRes = await fetch(`${BASE_URL}/v1/billing/credits/balance`, {
            headers: { Authorization: `Bearer ${JWT}` },
        });
        if (balanceRes.ok) {
            const { balance_cents } = await balanceRes.json();
            if (balance_cents >= this.creditThresholdCents) {
                await fetch(`${BASE_URL}/v1/billing/overage-method`, {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ method: "credits" }),
                });
            }
        }
        return this.delegate.onPaymentRequired(requirements, context);
    }
    async onStatus(...args) { return this.delegate.onStatus(...args); }
}
const treasurer = new HybridTreasurer(ampersendTreasurer, 100);
```

---

## Project structure

```
src/
├── resolve-buyer-key.ts    # Option A: env key; Option B: fetch from 1Claw vault
├── http-with-payments.ts   # HTTP client: 1Claw API + AmpersendTreasurer + wrapFetchWithPayment
├── mcp-with-payments.ts    # MCP client: 1Claw MCP + same treasurer
├── custom-treasurer.ts     # HybridTreasurer: 1Claw credits then AmpersendTreasurer
├── x402-server.ts         # Standalone paywall (Express + CDP facilitator)
└── x402-client.ts         # Paywall client (x402 v2, smart account, Option A/B)
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BUYER_PRIVATE_KEY` | Yes* | Session key for x402 (`0x...`). *Omit to use Option B (key from vault).* |
| `SMART_ACCOUNT_ADDRESS` | Yes* | Smart account (AmpersendTreasurer uses SmartAccountWallet). *Required for HTTP, MCP, hybrid.* |
| `ONECLAW_API_KEY` | Yes | 1Claw API key (`ocv_...`) |
| `ONECLAW_VAULT_ID` | Yes | 1Claw vault UUID |
| `ONECLAW_AGENT_ID` | MCP | Agent UUID (required for MCP, optional for HTTP/hybrid) |
| `ONECLAW_BASE_URL` | No | 1Claw API URL (default: `https://api.1claw.xyz`) |
| `BUYER_KEY_PATH` | No | Vault path for session key in Option B (default: `keys/x402-session-key`) |
| `AMPERSEND_API_URL` | No | Ampersend API URL (default: production) |
| `CDP_API_KEY_ID` | Server | Coinbase CDP key (for paywall server demo) |
| `CDP_API_KEY_SECRET` | Server | Coinbase CDP secret |
| `X402_PAY_TO_ADDRESS` | Server | Recipient address for paywall payments |

---

## Key patterns

- **1Claw** — Auth (JWT), vault secrets (session key in Option B), and the paid API/MCP that can return 402.
- **Ampersend** — [AmpersendTreasurer](https://docs.ampersend.ai/sdk/sdk-architecture-primitives) (authorization + limits + reporting) and **SmartAccountWallet** (ERC-1271 signing with session key).
- **Option B** — No `BUYER_PRIVATE_KEY` in env; key is stored in 1Claw at `BUYER_KEY_PATH` and fetched at startup (one API call).
- **Hybrid** — Check 1Claw credit balance; if sufficient, switch overage to credits; otherwise delegate to AmpersendTreasurer to sign on-chain payment.
- **Paywall demo** — Separate x402 v2 server and client (Coinbase CDP); client can also use Option A or B for the key.

## Wallet safety

- Use a **session key** for x402, not your main wallet.
- Fund the smart account (or session key EOA) only with what you need for testing.
- **AmpersendTreasurer** enforces limits and reports to the Ampersend Platform when your agent is registered there.

## See also

- [1Claw docs](https://docs.1claw.xyz) · [1Claw pricing](https://1claw.xyz/pricing)
- [Ampersend SDK](https://github.com/edgeandnode/ampersend-sdk) · [Ampersend SDK architecture](https://docs.ampersend.ai/sdk/sdk-architecture-primitives)
- [x402 specification](https://x402.org) · [Coinbase CDP](https://portal.cdp.coinbase.com/)
