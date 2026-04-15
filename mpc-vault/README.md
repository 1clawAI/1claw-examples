# MPC vault examples (2-of-2 and 2-of-3)

Reference-only demos for **Multi-Party Computation** vault modes on 1Claw:

| Script | Mode | Billing tier | Client share |
|--------|------|--------------|--------------|
| `npm run 2of2` | `2of2_client_custody` — XOR split between server HSM and you | **Pro+** | Required on every **GET** (`X-Client-Share` header, base64 from the **PUT** response) |
| `npm run 2of3` | `2of3_multi_hsm` — Shamir 2-of-3 across three cloud HSMs | **Business+** | Not used; server reconstructs from HSMs only |

**2-of-3 multi-HSM** also needs the API deployment to have **three MPC-capable HSM providers** configured (typically GCP KMS + AWS KMS + Azure Key Vault). If you see `400` on vault create, the environment may only run a single HSM (common in local dev).

## Quick start

```bash
cd examples/mpc-vault
npm install
cp .env.example .env
# Edit .env: ONECLAW_API_KEY=1ck_... (https://1claw.xyz/settings/api-keys — human key for vault create)
npm run 2of2    # Pro+ — 2-of-2 client custody (X-Client-Share on GET)
npm run 2of3    # Business+ — 2-of-3 multi-HSM (needs triple-HSM backend)
npm start       # runs both flows (each may skip or fail if tier/backend missing)
```

From the repo root you can copy all example env templates at once: `cd examples && npm run bootstrap`.

Keep vaults after a successful run:

```bash
MPC_SKIP_CLEANUP=1 npm run 2of2
```

## Implementation notes

- These scripts use the REST API directly so they can read `client_share` from the **PUT** response and send **`X-Client-Share`** on **GET**. The published `@1claw/sdk` `secrets.set` / `secrets.get` types omit those fields; you can still use the SDK for `vault.create` with `mpc_custody` and add `fetch` for the secret round-trip if you prefer.

- **2-of-3 + client custody** (`2of3_client_custody`) is another Business+ mode: Shamir across HSMs plus a client share on read. It is not shown here; follow the same pattern as 2-of-2 for the `X-Client-Share` header once you have the share from **PUT**.

## Links

- [Pricing / MPC tiers](https://1claw.xyz/pricing)
- [Security & MPC](https://1claw.xyz/security)
- [Docs](https://docs.1claw.xyz)
