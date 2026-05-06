# 1Claw Intents API — Quick Start (Base Sepolia)

One script, one API key. Bootstraps a vault, signing key, agent with Intents + Shroud, and submits a transaction on Base Sepolia — then cleans everything up.

## What it does

1. Creates a vault
2. Generates a random testnet signing key and stores it
3. Registers an agent with `intents_api_enabled` + `shroud_enabled` and transaction guardrails
4. Grants the agent read access to the key
5. Submits a 0-value transaction to the burn address on Base Sepolia
6. Cleans up (agent → secret → vault)

The signing key is random and the transaction sends 0 ETH, so **no testnet funds are needed**. The transaction will be signed server-side (the agent never sees the private key) and broadcast. If the random key has no ETH for gas, the broadcast fails gracefully — the signing still happened.

## Run

```bash
cd examples/intents-quick
cp .env.example .env
# Paste your 1Claw human API key (1ck_...) into .env
npm install
npm start
```

## Get your API key

1. Go to [1claw.xyz](https://1claw.xyz) and sign in
2. Settings → API Keys → Create
3. Copy the `1ck_...` key into `.env`

## What you'll see

```
══════════════════════════════════════════════════════════════
  1Claw Intents API — Quick Start (Base Sepolia)
══════════════════════════════════════════════════════════════

[1/6] Creating vault...
  Vault: intents-quick-1717000000 (uuid)

[2/6] Generating random signing key and storing in vault...
  Stored: keys/base-sepolia-signer (v1)

[3/6] Creating agent (Intents API + Shroud enabled)...
  Agent: intents-quick-1717000000-agent (uuid)
  Intents API: true
  Shroud:      true
  Guardrails:  chains=[base-sepolia], to=[0x...dEaD], max=0.01 ETH

[4/6] Granting agent read access to signing key...
  Policy: keys/** → [read]

[5/6] Submitting transaction (0 ETH to burn address on Base Sepolia)...
  Expected: insufficient funds for gas
  (Random key has no testnet ETH — tx was signed but broadcast failed. That's fine.)

[6/6] Verifying agent...
  Name:     intents-quick-1717000000-agent
  Active:   true
  Intents:  true
  Shroud:   true
  Chains:   [base-sepolia]

  Done. The agent signed a transaction on Base Sepolia without
  ever seeing the private key. The key lived in the HSM vault;
  the Intents API signed it server-side behind guardrails.

── Cleanup ──
  Agent deleted.
  Secret deleted.
  Vault deleted.
```

## How it works

```
You (human)                   1Claw Vault (HSM)              Base Sepolia
     │                              │                              │
     ├─ 1ck_ API key ──────────────►│                              │
     │                              │                              │
     │  Create vault + key + agent  │                              │
     │  Grant policy (keys/**)      │                              │
     │                              │                              │
     │         Agent (ocv_ key)     │                              │
     │              │               │                              │
     │              ├─ POST .../transactions ──►│                  │
     │              │  { to, value, chain,      │                  │
     │              │    signing_key_path }      │                  │
     │              │               │           │                  │
     │              │               │  ① Check guardrails          │
     │              │               │  ② Fetch key from vault      │
     │              │               │  ③ Sign tx (secp256k1, HSM)  │
     │              │               │  ④ Broadcast ────────────────►
     │              │               │                              │
     │              │◄── signed_tx + tx_hash ───│                  │
```

The private key never leaves the vault. The agent authenticates with its own `ocv_` key, but signing happens server-side inside the HSM. Guardrails (allowed chains, addresses, value caps) are enforced before the key is even touched.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Human API key (`1ck_...`) from 1claw.xyz Settings |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

## Related examples

- [basic](../basic/) — Vault CRUD, secrets, billing, and the full Intents flow (`npm run intents-api`)
- [tx-simulation](../tx-simulation/) — Chat UI with guardrails and Tenderly simulation
- [intents-layers](../intents-layers/) — Solver plan → 1Claw sign-only (two meanings of "intents")
- [shroud-demo](../shroud-demo/) — Shroud TEE proxy: health, Intents API, LLM proxy
