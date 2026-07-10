# Multichain Agent Demo

Chat UI for signing native transactions on **all six 1Claw chains** via the Intents API. Styled with the [1Claw brand kit](https://1claw.xyz/brand-kit) dark theme.

| Chain | Testnet | Auto-fund |
| ----- | ------- | --------- |
| Ethereum | Sepolia | Manual faucet |
| Bitcoin | Signet | Manual faucet |
| Solana | Devnet | ✓ RPC airdrop |
| XRP | Testnet | ✓ XRPL faucet API |
| Cardano | Preprod | Manual faucet |
| Tron | Shasta | Manual faucet (captcha) |

## Quick start (~10 min)

```bash
cd examples/multichain-agent
cp .env.example .env.local
```

1. Set `ONECLAW_API_KEY` (`1ck_` human key from [Settings → API keys](https://1claw.xyz/settings/api-keys)).
2. Set `GOOGLE_GENERATIVE_AI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
npm install
npm run bootstrap   # creates agent + 6 signing keys → writes .env.local
npm run dev         # http://localhost:3010
```

3. Open the **Funding** panel — use **Auto-fund** for Solana/XRP, or follow faucet links for the other chains.
4. Chat: *"List my signing keys and send 0.0001 ETH on sepolia to the burn address."*

### Optional: Cardano balances

Add `BLOCKFROST_PREPROD_KEY` to `.env.local` for ADA balance display in the Funding panel.

## Bootstrap

**CLI (recommended)** — writes credentials to `.env.local`:

```bash
npm run bootstrap
```

**In-app** — `Bootstrap all chains` button calls `POST /api/bootstrap` (copy returned `agent_id` / `agent_api_key` into `.env.local` and restart).

Bootstrap creates an agent with `intents_api_enabled: true` and provisions signing keys for: `ethereum`, `bitcoin`, `solana`, `xrp`, `cardano`, `tron`.

## Demo flow

1. **Bootstrap** → six HSM-backed addresses appear in Funding.
2. **Fund** → Solana/XRP one-click; ETH via [sepoliafaucet.com](https://sepoliafaucet.com/); BTC Signet via [signet.bc-2.jp](https://signet.bc-2.jp/); ADA via [Cardano faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/); TRX via [Shasta faucet](https://shasta.tronex.io/join/getJoinPage).
3. **Chat** → agent uses tools: `list_signing_keys`, `list_balances`, `submit_transaction`, `check_guardrails`.

## Reuse testnet-signer (optional)

If you already have a funded demo agent (e.g. repo `testnet-signer`), skip bootstrap and set:

```env
ONECLAW_AGENT_ID=...
ONECLAW_AGENT_API_KEY=ocv_...
```

## Architecture

```
Chat (Gemini) → /api/chat → 1Claw Intents API (agent JWT)
Funding panel → /api/funding → testnet RPCs + XRPL/Solana faucets
Bootstrap     → /api/bootstrap or scripts/bootstrap.ts → @1claw/sdk
```

Private keys never enter this app — only agent API credentials in server-side env.

## Related examples

- [multi-chain-keys](../multi-chain-keys/) — provision keys only
- [non-evm-keys](../non-evm-keys/) — non-EVM signing scripts
- [tx-simulation](../tx-simulation/) — EVM guardrails + Tenderly
