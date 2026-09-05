# Treasury Wallets Example

Demonstrates multi-chain treasury wallet generation, balance queries, and sending transactions using the `@1claw/sdk`.

Treasury wallets are human-only (not available to agents) and require a Pro or higher billing tier.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API key
```

## Scripts

| Script | Description |
| ------ | ----------- |
| `npm run generate` | Generate wallets for all supported chains |
| `npm run balance` | Check balances on generated wallets |
| `npm run send` | Send a transaction from an Ethereum wallet |

## Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `ONECLAW_API_KEY` | Yes | User API key (`1ck_...`) — treasury wallets are human-only |
| `ONECLAW_BASE_URL` | No | API base URL (defaults to `https://api.1claw.co`) |
| `SEND_TO` | For send | Recipient address |
| `SEND_AMOUNT` | For send | Amount in ETH |
| `SEND_PASSWORD` | For send | Account password for re-authentication |

## Supported Chains

- Ethereum (secp256k1)
- Bitcoin (secp256k1)
- Solana (Ed25519)
- XRP (Ed25519)
- Cardano (Ed25519)
- Tron (secp256k1)
