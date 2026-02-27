# 1Claw Intents API Demo

> **Reference only** — not for production use. Review and adapt for your own security requirements.

An interactive AI chat app showcasing **1Claw's Intents API with guardrails**. A Gemini-powered agent can sign and broadcast real on-chain transactions — but only within security boundaries configured by a human. Transactions can be simulated via Tenderly before committing real funds.

## What you'll learn

- How 1Claw's transaction guardrails block unauthorized transactions before signing
- How Tenderly simulation previews gas costs, balance changes, and revert reasons
- How server-side HSM signing works — the agent never sees the private key
- How ENS resolution and ERC-20 token transfers integrate into the flow

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with an agent that has:
  - `intents_api_enabled: true`
  - Transaction guardrails configured (allowed chains, value limits, address allowlist)
  - A signing key stored in a vault at `keys/{chain}-signer`
  - An access policy granting the agent `read` on `keys/**`
- A [Google Gemini API key](https://aistudio.google.com/apikey)

## Demo walkthrough (5–10 min)

### Step 1 — Install and configure

```bash
cd examples/tx-simulation
npm install
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
ONECLAW_API_URL=https://api.1claw.xyz
ONECLAW_AGENT_ID=your-agent-uuid
ONECLAW_AGENT_API_KEY=ocv_your_agent_api_key
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key
```

### Step 2 — Set up the 1Claw agent (if not already done)

Using the [1Claw CLI](https://www.npmjs.com/package/@1claw/cli):

```bash
# Create an agent with guardrails
1claw agent create tx-demo-agent \
  --intents-api \
  --tx-allowed-chains base \
  --tx-max-value 0.001 \
  --tx-daily-limit 0.005 \
  --tx-to-allowlist 0x000000000000000000000000000000000000dEaD

# Store the signing key
1claw secret put keys/base-signer \
  --vault <vault-id> --type private_key --value 0x<your-private-key>

# Grant the agent read access
1claw policy create \
  --vault <vault-id> --path "keys/**" \
  --principal-type agent --principal-id <agent-id> --permissions read
```

Or configure everything through the [1Claw dashboard](https://1claw.xyz).

### Step 3 — Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll see a chat interface with a sidebar showing the agent's guardrail configuration and a transaction log.

### Step 4 — Check guardrails

Click **"Check my restrictions"** or type:

> What transaction restrictions do I have?

The agent calls `check_guardrails` and reports:

```
Allowed chains: base
Max per tx: 0.001 ETH
Daily limit: 0.005 ETH
Allowed destinations: 0x…dEaD
```

### Step 5 — Try a blocked transaction

Click **"Try a blocked tx"** or type:

> Send 1 ETH to 0x0000000000000000000000000000000000000001 on ethereum

The agent attempts to submit and gets **blocked** — wrong chain (ethereum, not base), wrong address, and over the value limit. The UI shows a red "Transaction Blocked" card with the reason.

### Step 6 — Simulate a transaction

Type:

> Simulate sending 0.0001 ETH to the burn address on base

The agent calls `simulate_transaction`. Tenderly runs a dry-run and returns gas estimates, balance changes, and a dashboard link. The UI shows a blue "Simulation" card with a **"View simulation in Tenderly"** link.

### Step 7 — Send a real transaction

Type:

> Send 0.0001 ETH to the burn address on base

The agent calls `submit_transaction`. 1Claw validates the guardrails, signs the transaction server-side with the HSM-backed key, and broadcasts it to Base mainnet. The UI shows a green "Transaction Broadcast" card with a **block explorer link**.

### Step 8 — Try ENS and token transfers (bonus)

> Send 0.01 USDC to vitalik.eth on base

The agent resolves `vitalik.eth` via ENS, encodes the ERC-20 `transfer()` calldata, and submits via the Intents API.

## Tools

| Tool | Description |
|------|-------------|
| `check_guardrails` | Fetch the agent's guardrail config (chains, addresses, limits) |
| `simulate_transaction` | Dry-run via Tenderly — gas, balance changes, revert reasons |
| `submit_transaction` | Sign and broadcast a real transaction on-chain |
| `check_balance` | Check ETH balance of any address on any chain |
| `list_transactions` | List recent transactions submitted by this agent |
| `resolve_ens` | Resolve an ENS name (e.g. `vitalik.eth`) to a 0x address |
| `encode_token_transfer` | Encode ERC-20 transfer calldata (USDC, USDT, DAI, WETH) |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_URL` | No | 1Claw API URL (default: `https://api.1claw.xyz`) |
| `ONECLAW_AGENT_ID` | Yes | UUID of the agent with Intents API enabled |
| `ONECLAW_AGENT_API_KEY` | Yes | Agent API key (`ocv_...`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Google Gemini API key |

## How it works

```
Browser (React)
    │  useChat()
    ▼
Next.js API Route (/api/chat)
    │  Vercel AI SDK + Gemini
    │  Tool calls ──────────────────────┐
    ▼                                   ▼
Gemini LLM                     1Claw Vault API
    │                            │
    │  "send 0.001 ETH"         │  ① Validate guardrails
    │                            │  ② Fetch signing key (HSM)
    │                            │  ③ Sign transaction (secp256k1)
    │                            │  ④ Broadcast to chain
    │                            │
    ▼                            ▼
Chat response               On-chain tx
    │                         (basescan.org)
    ▼
Transaction Panel (real-time sidebar)
```

The right sidebar shows **Agent Guardrails** (static config) and a **Transaction Log** (live events — blocked in red, simulated in blue, broadcast in green). Counters in the header track blocked vs. signed transactions.

## Tech stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [Vercel AI SDK](https://sdk.vercel.ai/) with [Google Gemini](https://ai.google.dev/)
- [viem](https://viem.sh/) for ENS resolution and ERC-20 encoding
- [shadcn/ui](https://ui.shadcn.com/) components
- [1Claw](https://1claw.xyz) Intents API

## Next steps

- [Basic Examples](../basic/) — Core SDK flows (vault, secrets, billing)
- [Ampersend x402](../ampersend-x402/) — x402 micropayments for API access
- [1Claw Docs](https://docs.1claw.xyz)
