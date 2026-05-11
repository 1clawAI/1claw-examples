# EVM Signing Examples

End-to-end examples for every EVM signing intent supported by the 1Claw unified
`POST /v1/agents/{id}/sign` endpoint — message signing (EIP-191), typed data
(EIP-712), and all EIP-2718 transaction envelope types (legacy through EIP-7702).

## Prerequisites

- Node.js 20+
- A 1Claw agent with:
  - A provisioned **Ethereum signing key** (`POST /v1/agents/{id}/signing-keys`)
  - `intents_api_enabled: true`
  - `message_signing_enabled: true` (for personal_sign)
  - `eip712_domain_allowlist` configured (for typed_data)

## Quick Start

```bash
cd examples/evm-signing
cp .env.example .env        # fill in your agent credentials
npm install
npm run personal-sign       # EIP-191 message signing
```

## Scripts

| Script             | Description                              |
| ------------------ | ---------------------------------------- |
| `personal-sign`    | EIP-191 personal_sign message            |
| `typed-data`       | EIP-712 typed structured data (Permit)   |
| `legacy-tx`        | Type 0 legacy (EIP-155) transaction      |
| `eip1559-tx`       | Type 2 EIP-1559 transaction              |
| `sign-only`        | Sign without broadcasting                |
| `access-list-tx`   | Type 1 EIP-2930 access list transaction  |

## Signing Types

### EIP-191 — Personal Sign (`personal-sign`)

Signs an arbitrary UTF-8 message with the `\x19Ethereum Signed Message\n`
prefix. Commonly used for off-chain authentication (Sign-In with Ethereum),
proving key ownership, and gasless message attestations.

**Requires:** `message_signing_enabled: true` on the agent.

### EIP-712 — Typed Structured Data (`typed-data`)

Signs structured, human-readable data following the EIP-712 standard. The
example signs a USDC `Permit` — a gasless ERC-20 approval. The domain
separator and struct hash are computed server-side.

**Requires:** The `verifyingContract` address must be in the agent's
`eip712_domain_allowlist`, or `eip712_default_policy` must be set to `"allow"`.

> Dangerous types like `Permit`, `Permit2`, and `DaiPermit` always require an
> explicit domain allowlist entry, even when the default policy is `"allow"`.

### EIP-2718 Transaction Envelopes

All transaction types use `intent_type: "transaction"` with a `tx_type`
discriminator:

| `tx_type` | EIP     | Name                | Key Fields                                      |
| --------- | ------- | ------------------- | ----------------------------------------------- |
| 0         | EIP-155 | Legacy              | `gas_price`                                     |
| 1         | EIP-2930| Access List         | `gas_price` + `access_list`                     |
| 2         | EIP-1559| Dynamic Fee         | `max_fee_per_gas` + `max_priority_fee_per_gas`  |
| 3         | EIP-4844| Blob                | Type 2 fields + `max_fee_per_blob_gas` + `blob_versioned_hashes` |
| 4         | EIP-7702| Set Code            | Type 2 fields + `authorization_list`            |

### Sign-Only Mode (`sign-only`)

Every signing call through the unified endpoint returns the signed transaction
hex without broadcasting. You can then submit the raw transaction through your
own RPC provider for full control over broadcast timing and MEV protection.

## Guardrails

The Intents API enforces per-agent guardrails before signing:

| Guardrail                  | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `message_signing_enabled`  | Must be `true` for EIP-191 personal_sign           |
| `eip712_domain_allowlist`  | Allowlisted `verifyingContract` addresses for 712  |
| `eip712_default_policy`    | `"deny"` (default) or `"allow"` for unlisted domains |
| `tx_to_allowlist`          | Restrict which `to` addresses the agent can sign for |
| `tx_max_value_eth`         | Max ETH value per transaction                      |
| `tx_daily_limit_eth`       | Rolling 24h cumulative spend cap                   |
| `tx_allowed_chains`        | Restrict which chains the agent may transact on    |

Configure guardrails via the dashboard, SDK, or CLI before running these examples.
