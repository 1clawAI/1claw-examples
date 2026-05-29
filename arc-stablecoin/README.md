# 1Claw + Arc Stablecoin Transfer

> **Reference only** — not for production use. Review and adapt for your own security requirements.

**Difficulty: Intermediate**

This example demonstrates signing a native USDC transfer on [Arc Testnet](https://docs.arc.io) using the 1Claw Intents API. Arc is a stablecoin-native EVM L2 where **USDC is the native gas token** — every transaction fee is paid in USDC, not ETH.

## What you'll learn

- Use the Intents API to sign transactions on Arc (chain ID `5042002`)
- Store signing keys in a 1Claw vault instead of `.env`
- Set per-agent guardrails (allowed chains, value caps, daily limits) denominated in USDC
- Submit EIP-1559 transactions with Arc's minimum 20 Gwei base fee

## Quick start

```bash
cd examples/arc-stablecoin
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY to your 1ck_ key
npm start
```

## Prerequisites

- Node.js 20+
- A 1Claw account with an API key (`1ck_...` from Settings → API Keys)
- Testnet USDC on Arc (get it from [Circle Faucet](https://faucet.circle.com) — select Arc Testnet)

## How it works

```
┌─────────────────────────────────────────────────┐
│  This script                                     │
│  1. Provisions vault + agent + policy            │
│  2. Generates secp256k1 key → stores in vault    │
│  3. Submits tx via Intents API                   │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│  1Claw Vault API                                 │
│  - Verifies agent identity (JWT)                 │
│  - Checks guardrails (chain, value, daily limit) │
│  - Fetches signing key from vault                │
│  - Signs EIP-1559 tx (chain ID 5042002)          │
│  - Broadcasts via Arc RPC                        │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│  Arc Testnet (chain ID 5042002)                  │
│  - Native USDC gas token                         │
│  - EIP-1559 + EWMA fee smoothing                 │
│  - ~$0.01 per transaction                        │
│  - Explorer: testnet.arcscan.app                 │
└─────────────────────────────────────────────────┘
```

## Key differences from Ethereum/Base examples

| Aspect | Ethereum / Base | Arc |
|--------|----------------|-----|
| Gas token | ETH | USDC |
| Min base fee | Variable | 20 Gwei (floor) |
| `tx_max_value_eth` meaning | ETH cap | USDC cap (same field, different denomination) |
| Fee model | EIP-1559 | EIP-1559 + EWMA smoothing |
| Faucet | Alchemy / Coinbase | [Circle Faucet](https://faucet.circle.com) |

## Arc network details

| Parameter | Value |
|-----------|-------|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Gas token | USDC (18 decimals for gas, 6 decimals for ERC-20) |
| Fee target | ~$0.01 per transaction |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Human API key (`1ck_...`) |
| `ARC_RECIPIENT` | No | Recipient address (default: burn address) |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

## Flags

| Flag | Description |
|------|-------------|
| `--no-cleanup`, `-k` | Keep vault and agent after run (useful for funding and rerunning) |

## Expected output

```
=== 1Claw Intents API — Arc Stablecoin Transfer ===

Chain:     arc-testnet (chain ID 5042002)
Gas token: USDC (native)
Recipient: 0x000000000000000000000000000000000000dEaD

1️⃣  Creating vault...
   Vault: a1b2c3d4...
2️⃣  Generating signing key...
   Address: 0x7d3...
   ⚠️  Fund this address with USDC on Arc Testnet: https://faucet.circle.com
3️⃣  Storing signing key in vault...
4️⃣  Registering agent (Intents API + arc-testnet)...
   Agent: e5f6g7h8...
5️⃣  Granting agent read access...
6️⃣  Submitting USDC transfer on Arc Testnet...

--- Result ---
Status:   broadcast
TX hash:  0xabc...
From:     0x7d3...
Explorer: https://testnet.arcscan.app/tx/0xabc...

🧹 Cleaning up...
```

## Next steps

- [Intents API guide](https://docs.1claw.xyz/docs/guides/intents-api) — full documentation
- [Arc docs](https://docs.arc.io) — network details, contract addresses, App Kits
- [Arc MCP Server](https://docs.arc.io/ai/mcp) — complement with Arc's agent tooling
- [Transaction Simulation example](../tx-simulation/) — simulate before signing

## License

MIT.
