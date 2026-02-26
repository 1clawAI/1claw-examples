# 1Claw SDK — Basic Examples

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Three TypeScript scripts that walk through the core 1Claw workflows: vault CRUD, secrets management, billing, user signup with sharing, and the crypto transaction proxy.

## What you'll learn

- Authenticate with the 1Claw SDK (API key or agent token)
- Create a vault, store a secret, retrieve it, and list vault contents
- Check your billing usage
- Sign up a new user and share a secret by email
- Register an agent with the crypto transaction proxy, submit a signed transaction, and verify guardrails

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key (get one at **Settings → API Keys**)
- Build the SDK first: `cd packages/sdk && npm run build && cd ../..`

## Demo walkthrough (5 min)

### Step 1 — Install and configure

```bash
cd examples/basic
npm install
cp .env.example .env
```

Open `.env` and fill in your API key:

```env
ONECLAW_BASE_URL=https://api.1claw.xyz
ONECLAW_API_KEY=ocv_your_key_here
```

### Step 2 — Run the core vault flow

```bash
npm start
```

This runs `src/index.ts`, which:

1. Authenticates with your API key
2. Creates a vault called `demo-vault`
3. Stores a secret `OPENAI_KEY` with value `sk-demo-12345`
4. Retrieves and prints the secret (value truncated)
5. Lists all secrets in the vault
6. Checks your billing usage (tier, limits, current month)
7. Deletes the secret and vault

**Expected output:**

```
Creating client...

--- Creating vault ---
Vault created: demo-vault (a1b2c3d4-...)

--- Storing secret ---
Secret stored: OPENAI_KEY (v1)

--- Retrieving secret ---
Secret: OPENAI_KEY
  Type: api_key
  Value: sk-demo-...
  Version: 1

--- Listing secrets ---
  OPENAI_KEY (api_key, v1)

--- Billing usage ---
  Tier: free
  Free limit: 1000/month
  Used this month: 5

--- Cleaning up ---
Vault and secret deleted.

Done!
```

### Step 3 — Run the signup and sharing flow (optional)

```bash
npm run signup
```

This runs `src/signup-and-share.ts`, which:

1. Creates a new user account via `POST /v1/auth/signup`
2. Creates a vault and stores a `DATABASE_URL` secret
3. Shares the secret by email with a link that expires and has a max access count

> **Note:** On production, signup sends a verification email instead of returning a JWT immediately. The script falls back to API key auth if available.

### Step 4 — Run the crypto proxy flow (optional)

```bash
npm run crypto-proxy
```

This runs `src/crypto-proxy.ts`, which:

1. Creates a vault and stores a signing key at `keys/base-signer`
2. Registers an agent with `crypto_proxy_enabled: true`
3. Grants the agent a read policy on `keys/**`
4. Submits a transaction (signed server-side — the agent never sees the private key)
5. Verifies the agent's configuration
6. Disables the crypto proxy and cleans up

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npm start` | `src/index.ts` | Vault CRUD, secrets, billing |
| `npm run signup` | `src/signup-and-share.ts` | User signup, create vault, share by email |
| `npm run crypto-proxy` | `src/crypto-proxy.ts` | Agent with crypto proxy, transaction signing |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes* | Your API key (`ocv_...`). Not needed for signup script. |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |
| `ONECLAW_AGENT_ID` | No | Agent UUID. When set, `npm start` authenticates as an agent. |

## Key code patterns

**Create a client and authenticate:**

```typescript
import { createClient } from "@1claw/sdk";

const client = createClient({ baseUrl: "https://api.1claw.xyz" });
await client.auth.apiKeyToken({ api_key: "ocv_..." });
```

**Store and retrieve a secret:**

```typescript
await client.secrets.set(vaultId, "OPENAI_KEY", "sk-live-xxx", {
  type: "api_key",
  metadata: { provider: "openai" },
});

const { data } = await client.secrets.get(vaultId, "OPENAI_KEY");
console.log(data.value); // sk-live-xxx
```

## Next steps

- [LangChain Agent](../langchain-agent/) — Use an LLM to decide when to fetch secrets
- [FastMCP Tool Server](../fastmcp-tool-server/) — Build a custom MCP server with 1Claw
- [Transaction Simulation](../tx-simulation/) — AI agent with guardrails and Tenderly simulation
- [1Claw Docs](https://docs.1claw.xyz)
