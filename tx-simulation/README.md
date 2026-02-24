# 1Claw Transaction Proxy Demo

An interactive AI agent demo showcasing **1Claw's crypto transaction proxy with guardrails**. Chat with a Gemini-powered agent that can sign and broadcast real on-chain transactions — but only within the security boundaries configured by a human.

## What this demo shows

1. **Guardrail enforcement** — The agent's wallet is restricted by human-configured rules (allowed chains, max value, recipient allowlist). Transactions violating these rules are blocked before signing.
2. **Transaction simulation** — Preview what a transaction will do (balance changes, gas costs) before committing real funds via Tenderly.
3. **Secure signing** — Private keys never leave the server. The agent submits transaction intents; 1Claw signs them server-side with HSM-backed keys.
4. **On-chain execution** — Approved transactions are signed, broadcast, and confirmed on Base mainnet.

## Demo flow

1. Ask the agent: **"What are my transaction restrictions?"** — it checks its guardrails
2. Ask: **"Send 1 ETH to 0x0000…0001 on ethereum"** — blocked (wrong chain, wrong address, over limit)
3. Ask: **"Send 0.000001 ETH to the burn address on base"** — signed, broadcast, and confirmed on-chain

The right sidebar shows a real-time transaction log and the active guardrail configuration.

## Tech stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [Vercel AI SDK](https://sdk.vercel.ai/) with [Google Gemini](https://ai.google.dev/)
- [shadcn/ui](https://ui.shadcn.com/) components
- [1Claw](https://1claw.xyz) transaction proxy API

## Prerequisites

1. A [1Claw account](https://1claw.xyz) with an agent that has:
   - `crypto_proxy_enabled: true`
   - Transaction guardrails configured (allowed chains, value limits, address allowlist)
   - A signing key stored in a vault at `keys/{chain}-signer`
   - An access policy granting the agent `read` on the key path
2. A [Google AI API key](https://aistudio.google.com/apikey) for Gemini

## Setup

```bash
cd examples/tx-simulation
cp .env.example .env
# Fill in your credentials in .env

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start chatting.

### Environment variables

| Variable | Description |
|---|---|
| `ONECLAW_API_URL` | 1Claw API base URL (default: `https://api.1claw.xyz`) |
| `ONECLAW_AGENT_ID` | UUID of the agent with crypto proxy enabled |
| `ONECLAW_AGENT_API_KEY` | Agent API key (starts with `ocv_`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini API key |

### Setting up the 1Claw agent

Using the [1Claw CLI](https://www.npmjs.com/package/@1claw/cli):

```bash
# Create an agent with guardrails
1claw agent create tx-demo-agent \
  --crypto-proxy \
  --tx-allowed-chains base \
  --tx-max-value 0.00005 \
  --tx-daily-limit 0.0001 \
  --tx-to-allowlist 0x000000000000000000000000000000000000dEaD

# Store the signing key in a vault
1claw secret put keys/base-signer \
  --vault <vault-id> \
  --type private_key \
  --value 0x<your-private-key>

# Grant the agent read access to the key
1claw policy create \
  --vault <vault-id> \
  --path "keys/**" \
  --principal-type agent \
  --principal-id <agent-id> \
  --permissions read
```

Or use the [1Claw dashboard](https://1claw.xyz) to configure all of this through the UI.

## Architecture

```
Browser (React)
   │  useChat()
   ▼
Next.js API Route (/api/chat)
   │  Vercel AI SDK + Gemini
   │  Tool calls ─────────────────────┐
   ▼                                  ▼
Gemini LLM                    1Claw Vault API
   │                           │
   │  "submit 0.001 ETH"      │  ① Validate guardrails
   │                           │  ② Fetch signing key (HSM)
   │                           │  ③ Sign transaction
   │                           │  ④ Broadcast to Base
   │                           │
   ▼                           ▼
Chat response              On-chain tx
   │                        (basescan.org)
   ▼
Transaction Panel (real-time)
```

## License

MIT
