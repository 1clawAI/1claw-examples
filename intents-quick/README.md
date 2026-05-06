# Intents API — Quick Start (Base Sepolia)

Sign an on-chain transaction without ever touching a private key. One API key, one command.

## Prerequisites

- Node.js 20+
- A free [1Claw](https://1claw.xyz) account

## Setup

```bash
cd examples/intents-quick
cp .env.example .env
```

Open `.env` and paste your human API key:

```
ONECLAW_API_KEY=1ck_your_key_here
```

Get one from [1claw.xyz](https://1claw.xyz) → Settings → API Keys.

## Run

```bash
npm install
npm start
```

That's it. The script will:

1. Create a vault
2. Generate a random signing key and show you the address
3. Create an agent with Intents API + Shroud + transaction guardrails
4. Grant the agent access to the signing key
5. Submit a transaction on Base Sepolia (signed server-side, key never leaves the vault)
6. Clean everything up

## Want the transaction to land on-chain?

The script prints a public address like:

```
Address: 0xC58d...69A4
Fund this address from a Base Sepolia faucet to see the tx land on-chain:
https://www.alchemy.com/faucets/base-sepolia
```

Send some testnet ETH to that address, then run the script again.

## Optional: LLM through Shroud

Add a free Gemini key to also demo the Shroud LLM proxy:

```
GEMINI_API_KEY=AI...
```

Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free).

The script stores it in the vault and calls Gemini through Shroud. The API key never leaves the vault.

## What's happening under the hood

```
You (1ck_ key)          1Claw Vault (HSM)         Base Sepolia
      |                        |                        |
      |-- create vault ------->|                        |
      |-- store signing key -->|                        |
      |-- create agent ------->|                        |
      |-- grant policy ------->|                        |
      |                        |                        |
      |    Agent (ocv_ key)    |                        |
      |         |               |                        |
      |         |-- submit tx ->|                        |
      |         |               |-- check guardrails     |
      |         |               |-- fetch key from vault |
      |         |               |-- sign (secp256k1)     |
      |         |               |-- broadcast ---------->|
      |         |<-- tx_hash ---|                        |
```

The private key never leaves the vault. The agent authenticates with its own credential, but signing happens server-side. Guardrails (allowed chains, addresses, value caps) are enforced before the key is touched.
