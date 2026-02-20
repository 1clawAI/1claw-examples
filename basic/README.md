# 1Claw SDK — Basic Examples

Simple TypeScript examples demonstrating the core `@1claw/sdk` workflows.

## Examples

| Script                    | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `src/index.ts`            | Create vault, store/retrieve/list secrets, check billing, clean up               |
| `src/signup-and-share.ts` | Sign up via API, create a secret, share it by email                              |
| `src/crypto-proxy.ts`     | Register agent with crypto proxy, submit transaction, toggle proxy on/off        |

## Setup

```bash
# Install dependencies
npm install

# Copy and fill in your API key
cp .env.example .env
```

## Run

```bash
# Core vault + secrets flow
npm start

# Signup and email-sharing flow
npm run signup

# Crypto transaction proxy flow
npm run crypto-proxy
```

## Environment Variables

| Variable           | Required | Description                                                  |
| ------------------ | -------- | ------------------------------------------------------------ |
| `ONECLAW_BASE_URL` | No       | API URL (default: `https://api.1claw.xyz`)                   |
| `ONECLAW_API_KEY`  | Yes\*    | Your API key (`ocv_...`) — not needed for the signup example |

## What You'll See

**`npm start`** (requires API key):

```
Creating client...

--- Creating vault ---
Vault created: demo-vault (uuid)

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
```

**`npm run crypto-proxy`** (requires API key):

```
--- Creating vault ---
Vault: signing-keys (uuid)

--- Storing signing key ---
Key stored: keys/base-signer (v1)

--- Registering agent with crypto proxy ---
Agent: defi-bot (uuid)
  crypto_proxy_enabled: true
  API key: ocv_xxxxxxxx...

--- Granting vault access ---
Policy granted: keys/** → [read]

--- Submitting transaction ---
  Status: signed
  Tx hash: 0x...
  Signed tx: 0xf86c...

--- Verifying agent ---
  Name: defi-bot
  Active: true
  Crypto proxy: true
  Scopes: [vault:read, tx:sign]

--- Disabling crypto proxy ---
  crypto_proxy_enabled: false

--- Cleaning up ---
Agent, key, and vault deleted.
```

**`npm run signup`** (no API key needed):

```
--- Signing up ---
Account created! JWT received.

--- Creating vault + secret ---
Vault: shared-vault (uuid)
Secret stored: DATABASE_URL

--- Sharing secret by email ---
Shared!
  Share ID: uuid
  Recipient: colleague@example.com
  Expires: 2025-03-01T...
  Max accesses: 3
  URL: https://api.1claw.xyz/v1/share/uuid
```
