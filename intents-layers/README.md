# Intents layers — solver plan → 1Claw signing

This example shows **two different meanings of “intents”** on Ethereum and how they compose:

| Layer | Who | What “intent” means |
| ----- | --- | ------------------- |
| **Order / route intents** | User ↔ solvers (CoW Swap, UniswapX, ERC-7683, …) | “Get me the best execution” — solvers return **calldata + `to` + `value`**. |
| **Agent → signer intents** | Agent ↔ 1Claw Vault or Shroud | “Sign this exact tx” — the agent never sees the **private key**; guardrails + HSM/TEE sign. |

1Claw does **not** replace solvers. It sits **under** them: whatever calldata a solver (or your own router logic) produces becomes the payload for `POST /v1/agents/{id}/transactions` or `…/transactions/sign`.

## What this script does

1. **`mockSolverFillPlan()`** — returns a toy “solver execution plan” (`chain`, `to`, `value`, `data`, `signing_key_path`). In production you would paste real output from your routing stack.
2. **Optional live step** — if `ONECLAW_AGENT_ID` and `ONECLAW_AGENT_API_KEY` are set, calls **`signTransaction`** (sign-only, no broadcast) so you can see Layer B without spending gas.

## Prerequisites (live sign)

- An agent with **`intents_api_enabled: true`**
- A **secp256k1** private key in the vault at `keys/sepolia-signer` (default path in the mock plan)
- A policy granting the agent **read** on `keys/**` (or that path)
- Optional **`tx_to_allowlist`**: if set, include `DEMO_TO_ADDRESS` in the allowlist (defaults to the zero address)

## Run

```bash
cd examples/intents-layers
cp .env.example .env
# Edit .env with agent credentials (optional)
npm install
npm start
```

Without agent credentials, the script still prints the architecture and the mock JSON — useful for talks and docs.

## See also

- [Intents API](https://docs.1claw.xyz/docs/guides/intents-api) (1Claw docs)
- [Transaction simulation](../tx-simulation/) (Tenderly + guardrails)
- [Shroud demo](../shroud-demo/) (TEE path for the same API surface)
