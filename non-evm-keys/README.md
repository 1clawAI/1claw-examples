# Non-EVM Chain Signing

Provision HSM-backed signing keys, derive addresses, and **sign + broadcast native transactions** for Bitcoin, Solana, XRP, Cardano, and Tron using the 1Claw SDK. Private keys are stored in the org's `__agent-keys` vault and never leave the HSM/TEE boundary — the agent only submits an intent.

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
| `npm run sign`    | `npm run sign -- <chain> <to> <amount>` | Sign + broadcast a native transfer on a testnet |

## Signing a transaction

Provision a key for the chain first, then sign + broadcast (or add `--sign-only` to skip broadcast):

```bash
npm run solana                                            # provision the Solana key
npm run sign -- solana-devnet   9WzD...WWM   0.001         # send 0.001 SOL
npm run sign -- bitcoin-testnet tb1q...       0.0001       # send 0.0001 BTC
npm run sign -- xrp-testnet     rPT1...        1 --dtag 12345
npm run sign -- cardano-preprod addr_test1...  1           # needs BLOCKFROST_PROJECT_ID_PREPROD server-side
npm run sign -- tron-shasta     TJRa...         1
# SPL / TRC-20 token transfer:
npm run sign -- solana-devnet   <recipient>    5 --token <mint> --decimals 6
```

`amount` is the human-readable major unit (BTC/SOL/XRP/ADA/TRX). 1Claw auto-fetches the chain data it needs (UTXOs, blockhash, sequence, protocol params, ref block), signs inside the HSM/TEE, and broadcasts.

## XRP: `xrpl_tx_json` (arbitrary transaction types)

Beyond simple Payments, you can sign **any** of the 30+ XRPL transaction types by passing the `xrpl_tx_json` field. The server auto-fills `Account`, `Sequence`, `Fee`, `Flags`, `LastLedgerSequence`, and `SigningPubKey` — you provide only the transaction-specific fields.

```bash
# Run the advanced xrpl_tx_json demo
npm run sign -- xrp-testnet rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe 0 --xrpl-demo
```

### Example: TrustSet

```typescript
const result = await client.agents.signTransaction(agentId, {
  chain: "xrp-testnet",
  to: recipientAddress,   // required by API schema but ignored when xrpl_tx_json is present
  value: "0",
  xrpl_tx_json: {
    TransactionType: "TrustSet",
    LimitAmount: {
      currency: "USD",
      issuer: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      value: "1000",
    },
  },
});
```

### Example: OfferCreate (DEX order)

```typescript
const result = await client.agents.signTransaction(agentId, {
  chain: "xrp-testnet",
  to: recipientAddress,
  value: "0",
  xrpl_tx_json: {
    TransactionType: "OfferCreate",
    TakerPays: { currency: "USD", issuer: issuerAddress, value: "100" },
    TakerGets: "50000000", // 50 XRP in drops
  },
});
```

### Supported XRPL transaction types

| Category | Types |
| -------- | ----- |
| Payments & Escrow | Payment, EscrowCreate, EscrowFinish, EscrowCancel |
| Trust & Tokens | TrustSet, Clawback |
| DEX | OfferCreate, OfferCancel |
| Payment Channels | PaymentChannelCreate, PaymentChannelFund, PaymentChannelClaim |
| NFTs | NFTokenMint, NFTokenBurn, NFTokenCreateOffer, NFTokenAcceptOffer, NFTokenCancelOffer |
| AMM | AMMCreate, AMMDeposit, AMMWithdraw, AMMBid, AMMDelete, AMMVote |
| Account | AccountSet, AccountDelete, SetRegularKey, SignerListSet, DepositPreauth |
| Checks & Tickets | CheckCreate, CheckCash, CheckCancel, TicketCreate |

The legacy `to`/`value`/`destination_tag` Payment path is preserved for backward compatibility — you don't need `xrpl_tx_json` for simple payments.

## Supported Chains

| Chain    | Curve      | Address Format                                | Explorer                    | Key Gen     | Signing       |
| -------- | ---------- | --------------------------------------------- | --------------------------- | ----------- | ------------- |
| Bitcoin  | secp256k1  | P2WPKH native SegWit (bech32, `bc1q...`)      | mempool.space               | Available   | **Live**      |
| Solana   | Ed25519    | Base58-encoded 32-byte public key              | solscan.io                  | Available   | **Live** (SOL + SPL) |
| XRP      | Ed25519    | Classic address (base58check, `r...`)          | xrpscan.com                 | Available   | **Live** (30+ tx types via `xrpl_tx_json`) |
| Cardano  | Ed25519    | Bech32 enterprise address (`addr1...`)         | cardanoscan.io              | Available   | **Live**      |
| Tron     | secp256k1  | Base58Check (`T...`)                           | tronscan.org                | Available   | **Live** (TRX + TRC-20) |

## Security

All private keys are generated and stored inside Google Cloud KMS (HSM-backed). They are written to the org's `__agent-keys` vault at `agents/{id}/chains/{chain}/private_key` and are never exposed to callers. Only the public key and derived address are returned by the API.

For EVM transaction signing (Ethereum, Base, Optimism, etc.), see the `evm-signing` and `agentic-tx` examples.
