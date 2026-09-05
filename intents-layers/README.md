# Intents layers — solver plan → 1Claw signing

This example shows **two different meanings of “intents”** on Ethereum and how they compose:

| Layer | Who | What “intent” means |
| ----- | --- | ------------------- |
| **Order / route intents** | User ↔ solvers (CoW Swap, UniswapX, ERC-7683, …) | “Get me the best execution” — solvers return **calldata + `to` + `value`**. |
| **Agent → signer intents** | Agent ↔ 1Claw Vault or Shroud | “Sign this exact tx” — the agent never sees the **private key**; guardrails + HSM/TEE sign. |

1Claw does **not** replace solvers. It sits **under** them: whatever calldata a solver (or your own router logic) produces becomes the payload for `POST /v1/agents/{id}/transactions` or `…/transactions/sign`.

## What this script does

1. **Layer A — execution plan**
   - **`SOLVER_MODE=mock`** (default): `mockSolverFillPlan()` — toy no-op on **Sepolia** (`value: 0`, empty calldata). Good for CI and talks.
   - **`SOLVER_MODE=1inch`**: calls the **1inch Swap API** and maps the returned `tx { to, data, value }` into the same JSON shape CoW / UniswapX / an ERC-7683 relayer would ultimately ask a wallet to sign **after** matching (aggregated route, not the same protocol as CoW’s order book — see below).
2. **Layer B — 1Claw**
   - Default: **`signTransaction`** (no gas, no broadcast).
   - Optional: **`BROADCAST=1`** → **`submitTransaction`** (real chain spend). Prefer **`SIMULATE_FIRST=false`** only if you know what you’re doing; default is to pass `simulate_first: true` when unset so Tenderly can block obvious reverts (requires Vault/Tenderly config).

### CoW / UniswapX vs this example

| System | What gets signed first | What 1Claw sees |
| ------ | ------------------------ | --------------- |
| **CoW Swap** | EIP-712 **order** off-chain; solvers compete; **settlement** is an EVM tx | You’d still end up with a concrete `(chain, to, value, data)` for that settlement — same fields the Intents API takes. This repo does not submit CoW orders; use CoW’s API/SDK for that half. |
| **1inch (here)** | HTTP quote returns a **ready-made** EVM tx for your `from` | Drop-in demo for “real calldata from an aggregator.” |

**Sepolia + “real” liquidity:** many aggregators focus on **mainnet**. If `CHAIN_ID=11155111` fails against 1inch, use **`CHAIN_ID=1`** with a **tiny** `SWAP_AMOUNT`, a funded **`keys/ethereum-signer`**, and keep **`BROADCAST`** off until you’ve validated `sign` works.

## Prerequisites (live sign)

- An agent with **`intents_api_enabled: true`**
- A **secp256k1** private key in the vault at **`keys/{chain}-signer`** where `{chain}` matches the plan (`sepolia` for mock, `ethereum` / `base` / … for 1inch `CHAIN_ID`)
- A policy granting the agent **read** on `keys/**` (or that path)
- Optional **`tx_to_allowlist`**: must include the **`to`** from the plan (mock: `DEMO_TO_ADDRESS`; 1inch: router from API response — often easiest to **leave allowlist empty** while testing, then tighten)

## Run

```bash
cd examples/intents-layers
cp .env.example .env
# Edit .env with agent credentials (optional)
npm install
npm start
```

Without agent credentials, the script still prints the architecture and the mock JSON — useful for talks and docs.

### Example: 1inch on Ethereum mainnet (tiny swap, sign-only)

`SOLVER_MODE=1inch` **requires** a non-empty **`ONEINCH_API_KEY`** (from [1inch Portal](https://portal.1inch.dev/)) in `.env` or in the shell. Setting only `SOLVER_MODE` and `CHAIN_ID` is not enough — an empty `ONEINCH_API_KEY=` line in `.env` is treated as missing.

```bash
export SOLVER_MODE=1inch
export CHAIN_ID=1
export ONEINCH_API_KEY="your_portal_token"
export QUOTE_FROM_ADDRESS="0x…"   # same address as keys/ethereum-signer
export SWAP_SRC_TOKEN=0xEeeeeEeeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
export SWAP_DST_TOKEN=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48   # USDC mainnet — example only
export SWAP_AMOUNT=1000000000000000   # 0.001 ETH in wei — use a size you can afford
npm start
```

Then only if sign succeeds and you accept gas + outcome risk:

```bash
export BROADCAST=1
npm start
```

## See also

- [Intents API](https://docs.1claw.co/docs/guides/intents-api) (1Claw docs)
- [Transaction simulation](../tx-simulation/) (Tenderly + guardrails)
- [Shroud demo](../shroud-demo/) (TEE path for the same API surface)
