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
export ONECLAW_API_URL=https://api.1claw.xyz
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

## Notes

- The `plt_` key can scaffold resources but cannot read the end-user's secrets
- Resources created via bootstrap are `platform_locked: true`
- The end-user owns their vault, agent, and API key
- The operator sees metadata and audit events but not secret values
