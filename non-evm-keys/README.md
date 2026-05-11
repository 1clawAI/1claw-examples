# Non-EVM Chain Keys

Generate HSM-backed signing keys and derive addresses for Bitcoin, Solana, XRP, Cardano, and Tron using the 1Claw SDK. Private keys are stored in the org's `__agent-keys` vault and never leave the HSM boundary.

## Prerequisites

- Node.js 20+
- A 1Claw agent with Intents API enabled
- Agent API key (`ocv_` prefixed)

## Quick Start

```bash
cp .env.example .env
# Fill in ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY

npm install
npm start        # Provision keys for all 5 non-EVM chains
```

## Scripts

| Script         | Command             | Description                              |
| -------------- | ------------------- | ---------------------------------------- |
| `npm run all`  | `npm start`         | Provision keys for all 5 chains at once  |
| `npm run bitcoin` | —              | Provision a Bitcoin key only             |
| `npm run solana`  | —              | Provision a Solana key only              |
| `npm run xrp`     | —              | Provision an XRP key only                |
| `npm run cardano` | —              | Provision a Cardano key only             |
| `npm run tron`    | —              | Provision a Tron key only                |

## Supported Chains

| Chain    | Curve      | Address Format                                | Explorer                    | Key Gen     | Signing       |
| -------- | ---------- | --------------------------------------------- | --------------------------- | ----------- | ------------- |
| Bitcoin  | secp256k1  | P2WPKH native SegWit (bech32, `bc1q...`)      | mempool.space               | Available   | Coming soon   |
| Solana   | Ed25519    | Base58-encoded 32-byte public key              | solscan.io                  | Available   | Coming soon   |
| XRP      | Ed25519    | Classic address (base58check, `r...`)          | xrpscan.com                 | Available   | Coming soon   |
| Cardano  | Ed25519    | Bech32 enterprise address (`addr1...`)         | cardanoscan.io              | Available   | Coming soon   |
| Tron     | secp256k1  | Base58Check (`T...`)                           | tronscan.org                | Available   | Coming soon   |

## Security

All private keys are generated and stored inside Google Cloud KMS (HSM-backed). They are written to the org's `__agent-keys` vault at `agents/{id}/chains/{chain}/private_key` and are never exposed to callers. Only the public key and derived address are returned by the API.

For EVM transaction signing (Ethereum, Base, Optimism, etc.), see the `evm-signing` and `agentic-tx` examples.
