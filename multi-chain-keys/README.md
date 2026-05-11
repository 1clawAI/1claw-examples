# Multi-Chain Signing Keys

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Provision HSM-backed signing keys for 6 blockchains, view derived addresses, and rotate keys — all without private keys ever leaving the HSM.

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an API key
- An agent with the **Intents API enabled** (create one in the [dashboard](https://1claw.xyz/agents) or via the SDK)

## Quick start

```bash
cd examples/multi-chain-keys
npm install
cp .env.example .env
# Edit .env: set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY
npm run provision
```

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npm run provision` | `src/provision-all-keys.ts` | Provision keys for all 6 chains, print addresses |
| `npm run list` | `src/list-keys.ts` | List all provisioned signing keys |
| `npm run rotate` | `src/rotate-keys.ts` | Rotate a key (default: ethereum) |
| `npm start` | `src/provision-all-keys.ts` | Alias for `provision` |

### Rotate a specific chain

```bash
npm run rotate -- solana
npm run rotate -- bitcoin
```

## Supported chains

| Chain | Curve | Address format |
|-------|-------|----------------|
| Ethereum | secp256k1 | `0x` hex (EIP-55 checksum) |
| Bitcoin | secp256k1 | Bech32 (`bc1q...`) |
| Solana | Ed25519 | Base58 |
| XRP | Ed25519 | Base58 (`r...`) |
| Cardano | Ed25519 | Bech32 (`addr1...`) |
| Tron | secp256k1 | Base58 (`T...`) |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_AGENT_API_KEY` | Yes | Agent API key (`ocv_...`) |
| `ONECLAW_AGENT_ID` | Yes | Agent UUID |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |
| `ONECLAW_API_KEY` | No | User API key (not used by these scripts) |

## Security

Private keys are generated and stored inside the HSM (Google Cloud KMS with hardware protection). They **never leave the secure enclave** — the SDK only receives public keys and derived addresses. Key rotation generates a new keypair; the old key is deactivated but retained for audit.

## Next steps

- [Basic Example](../basic/) — Vault CRUD, secrets, billing
- [Transaction Simulation](../tx-simulation/) — Submit transactions with Tenderly simulation
- [1Claw Docs](https://docs.1claw.xyz)
