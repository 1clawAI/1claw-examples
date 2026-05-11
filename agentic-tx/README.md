# Agentic Transactions — Real Mainnet Funds

End-to-end example: create an AI agent, provision signing keys, and execute funded on-chain transactions with built-in guardrails. Covers Ethereum mainnet, Base, and testnets.

> **Warning:** This example sends real ETH on mainnet and L2 networks. Start with testnets (Sepolia, Base Sepolia) until you are comfortable with the flow.

## Prerequisites

- Node.js 20+
- A [1Claw](https://1claw.xyz) account with a `1ck_` API key
- ETH on the chain(s) you want to transact on

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in your API key
cp .env.example .env
# Edit .env → set ONECLAW_API_KEY to your 1ck_ key

# 3. Run setup — creates vault, agent, signing key
npm run setup
# Copy the printed credentials into .env

# 4. Fund the printed Ethereum address on your chain(s) of choice

# 5. Send a transaction
npm run send-eth        # Ethereum mainnet
npm run send-base       # Base L2
npm run multi-chain     # All chains at once
```

## Scripts

| Script | Description |
|---|---|
| `npm run setup` | Create vault + agent + signing key, print credentials & funding instructions |
| `npm run send-eth` | Sign & broadcast an ETH transfer on Ethereum mainnet |
| `npm run send-base` | Sign & broadcast an ETH transfer on Base (lower gas) |
| `npm run multi-chain` | Provision keys on all chains, fund, then self-transfer on each |

## Transaction Guardrails

The agent is created with safety caps enforced server-side before every signature:

| Guardrail | Value | Description |
|---|---|---|
| `tx_max_value_eth` | `0.01` | Max ETH per single transaction |
| `tx_daily_limit_eth` | `0.05` | Rolling 24-hour cumulative spend cap |
| `tx_allowed_chains` | `ethereum, base, sepolia, base-sepolia` | Chains the agent may transact on |
| `tx_to_allowlist` | *(empty = unrestricted)* | Restrict `to` addresses (add via dashboard or SDK) |

Violations return a 403 with a descriptive error. Adjust limits in the dashboard or via `client.agents.update()`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ONECLAW_BASE_URL` | No | API base URL (default: `https://api.1claw.xyz`) |
| `ONECLAW_API_KEY` | Yes (setup) | Your `1ck_` user API key |
| `ONECLAW_AGENT_ID` | Yes (send) | Agent UUID from setup |
| `ONECLAW_AGENT_API_KEY` | Yes (send) | Agent `ocv_` API key from setup |
| `ONECLAW_VAULT_ID` | No | Vault UUID (informational) |
| `ETH_AMOUNT` | No | Amount of ETH to send (default: `0.0001`) |
| `RECIPIENT_ADDRESS` | No | Destination address (default: burn address) |

## Safety Notes

- **Start on testnets.** Use Sepolia and Base Sepolia faucets before touching mainnet.
- **Guardrails are enforced server-side.** Even if you modify the client code, the vault rejects transactions that exceed `tx_max_value_eth`, `tx_daily_limit_eth`, or target a disallowed chain.
- **API keys are one-time.** The agent `ocv_` key is shown once during setup. Store it immediately.
- **Private keys never leave the TEE.** Signing happens inside the 1Claw vault (or Shroud TEE). Your agent never sees raw private keys.
