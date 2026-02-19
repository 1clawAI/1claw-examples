# 1Claw SDK — Basic Examples

Simple TypeScript examples demonstrating the core `@1claw/sdk` workflows.

## Examples

| Script                    | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `src/index.ts`            | Create vault, store/retrieve/list secrets, check billing, clean up |
| `src/signup-and-share.ts` | Sign up via API, create a secret, share it by email                |

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
