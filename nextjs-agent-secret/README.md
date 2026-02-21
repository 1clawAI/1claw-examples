# 1Claw Agent Secret Demo

> **Warning — Not for production use.** This example is for reference and learning only. Review and adapt for your own security requirements before using in production.

**1Claw** is an HSM-backed secrets manager for AI agents and humans, featuring encrypted vaults, access policies, human-in-the-loop approvals, and x402 micropayments.

This demo shows an AI agent (Claude) using the `@1claw/sdk` to securely access secrets stored in a 1Claw vault, with human approval gates and server-side-only secret handling.

## What This Demonstrates

1. **AI agent accesses vault secrets** — Claude calls 1Claw tools to list vaults, list keys, and fetch secrets
2. **Human-in-the-loop approval** — gated secrets trigger an approval request; a banner appears in the UI for the human to approve/deny
3. **Server-side secret handling** — decrypted secrets are never sent to the client or included in model responses
4. **x402 payment awareness** — when free tier is exhausted, the agent reports that payment is required

## Setup

### 1. Create a vault and add secrets

Log in at [1claw.xyz](https://1claw.xyz), create a vault, and add a secret (e.g. `OPENAI_KEY`).

### 2. Get an API key

Go to **API Keys** in the 1Claw dashboard and create a new key.

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable | Description |
|----------|-------------|
| `ONECLAW_API_KEY` | Your 1Claw API key (`ocv_...`) |
| `ONECLAW_BASE_URL` | API URL (default: `https://api.1claw.xyz`) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude |

### 4. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

```
User → Chat UI → /api/chat (streaming)
                    │
                    ├─ Claude decides to call 1claw tools
                    ├─ getSecret → @1claw/sdk → 1Claw API
                    │     ├─ 200: secret cached server-side
                    │     ├─ 402: "payment required" returned to model
                    │     └─ 403 (approval): "pending_approval" returned
                    │
                    └─ Model responds (never sees raw secret values)
```

## x402 Extension

When the free tier is exhausted, the SDK returns a `PaymentRequiredError` with the full x402 payment requirement. To enable auto-pay, configure an `x402Signer` on the client:

```typescript
const client = createClient({
  baseUrl: "https://api.1claw.xyz",
  apiKey: "ocv_...",
  x402Signer: myWalletSigner,
  maxAutoPayUsd: 0.01,
});
```

The SDK will automatically sign and submit USDC payments on Base when a 402 is received.
