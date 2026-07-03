# Platform Connect Example

Demonstrates how to use the 1Claw Platform API to onboard users and bootstrap vaults + agents for them.

## Overview

This example shows:
1. Registering a platform app (`plt_` API key)
2. Creating a bootstrap template (vault + agent + policy)
3. Provisioning a user via email
4. Bootstrapping resources from the template
5. Using the claim URL to onboard the user

## Prerequisites

- A 1Claw account with Pro+ subscription
- Node.js 20+
- `@1claw/sdk` installed

## Setup

```bash
npm install
```

Set environment variables:

```bash
export ONECLAW_BASE_URL=https://api.1claw.xyz
export ONECLAW_PLATFORM_KEY=plt_your_key_here
```

## Run

```bash
npx tsx src/index.ts
```

## Flow

```
Operator App                1Claw API
    |                           |
    |-- Register Platform App ->|  POST /v1/platform/apps
    |<- plt_ API key ----------|
    |                           |
    |-- Create Template ------->|  POST /v1/platform/apps/{id}/templates
    |<- template_id ------------|
    |                           |
    |-- Upsert User ----------->|  POST /v1/platform/users/upsert
    |<- connection_id ----------|
    |                           |
    |-- Bootstrap User -------->|  POST /v1/platform/connections/{id}/bootstrap
    |<- claim_url + summary ----|
    |                           |
    |-- Redirect user to ------>|  User claims resources at claim_url
    |   claim_url               |
```

## Resource Grants (User-Side)

After claiming, the end-user can grant the platform app access to **additional** vaults and agents via the dashboard grant page or the SDK:

```
End-User                    1Claw API
    |                           |
    |-- Grant Resources ------->|  POST /v1/platform/connections/{id}/grant
    |<- grants[] ---------------|  { vault_ids, agent_ids }
    |                           |
    |-- List Grants ----------->|  GET /v1/platform/connections/{id}/grants
    |<- grants[] ---------------|
    |                           |
    |-- Revoke Grant ---------->|  DELETE /v1/platform/connections/{id}/grants/{grant_id}
    |<- 204 --------------------|
```

The grant page is available at `/connect/{slug}/grant?connection={id}` in the dashboard, where users select vaults and agents to share with the platform app. Grants are revocable from **Settings → Connected Apps**.

SDK usage (with a user `1ck_` API key):

```typescript
import { OneclawClient } from "@1claw/sdk";

const client = new OneclawClient({ apiKey: "1ck_user_key" });

// Grant access to specific vaults and agents
const { data } = await client.platform.grantAccess(connectionId, {
  vault_ids: ["vault-uuid"],
  agent_ids: ["agent-uuid"],
});

// List active grants
const { data: grants } = await client.platform.listGrants(connectionId);

// Revoke a specific grant
await client.platform.revokeGrant(connectionId, grantId);
```

## Notes

- The `plt_` key can scaffold resources but cannot read the end-user's secrets
- Resources created via bootstrap are `platform_locked: true`
- The end-user owns their vault, agent, and API key
- The operator sees metadata and audit events but not secret values
- Resource grants are user-initiated — only the connected user can grant or revoke access

### Bootstrap response details

The `POST /v1/platform/connections/{id}/bootstrap` response `summary` object includes:

- **`agent_api_key`** — One-time `ocv_` API key for the bootstrapped agent (not returned again; store it securely)
- **`signing_keys[]`** — Array of provisioned signing keys, each with `chain`, `address`, and `public_key` (only present when the template specifies `signing_keys` on an agent entry)
