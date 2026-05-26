# 1Claw + Google A2A (Agent-to-Agent)

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Four demos showing AI agents communicating via [Google's A2A protocol](https://google.github.io/A2A/), using 1Claw as the secure credential layer. A coordinator agent discovers a worker agent, sends it tasks, and the worker uses 1Claw (vault secrets or Intents API signing) to complete them.

## Quick start (30 seconds)

All you need is a 1Claw human API key (`1ck_...`). Get one free at [1claw.xyz/settings/api-keys](https://1claw.xyz/settings/api-keys).

```bash
cd examples/google-a2a
npm install

# Bootstrap everything: vault, agent, signing key, policy
ONECLAW_API_KEY=1ck_your_key_here npm run intents:setup

# Run the Intents API demo
npm run intents
```

That's it. The setup script creates the vault, an agent with Intents API enabled, a signing key, and an access policy. Then the demo signs a transaction via A2A without the agent ever touching the private key.

For the simpler vault demo (list/fetch secrets):

```bash
# Same key, creates a vault + agent + policy for secret access
ONECLAW_API_KEY=1ck_your_key_here npx tsx scripts/setup-intents-agent.ts
cp .env.intents .env
npm start
```

## What you'll learn

- Implement the A2A protocol (Agent Card discovery, JSON-RPC task handling)
- Build a worker agent backed by the `@1claw/sdk` for vault operations
- Use Google ADK (Agent Development Kit) with Gemini to reason about tasks via LLM
- Coordinate two agents doing ECDH key exchange with vault-stored keys

## Four demos

| Demo | Command | Description |
|------|---------|-------------|
| **Vault Worker** | `npm start` | Regex-based worker lists/fetches secrets; coordinator sends tasks via A2A |
| **ADK Agent** | `npm run adk` | Gemini-powered worker uses ADK `FunctionTool`s to reason about vault tasks |
| **ECDH Key Exchange** | `npm run ecdh` | Two agents (Alice, Bob) perform ECDH key agreement — keys optionally stored in 1Claw |
| **Intents API** | `npm run intents` | Sign and broadcast transactions via A2A — private key stays in TEE |

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with a vault containing at least one secret
- For the ADK demo: a [Gemini API key](https://aistudio.google.com/apikey)
- Uses `@1claw/sdk@^0.23.0` (npm install will fetch it)

---

## Demo 1: Vault Worker (5 min)

The simplest demo — a worker agent with regex-based task routing.

### Step 1 — Install and configure

```bash
cd examples/google-a2a
npm install
cp .env.example .env
```

Open `.env` and fill in:

```env
ONECLAW_API_KEY=ocv_your_key_here
ONECLAW_VAULT_ID=your-vault-uuid
```

### Step 2 — Run the demo

```bash
npm start
```

This launches both the worker (port 4100) and the coordinator. The coordinator:

1. **Discovers** the worker via `GET /.well-known/agent.json` (Agent Card)
2. **Sends a task:** *"List all available secrets in the vault"*
3. The worker calls `sdk.secrets.list()` and returns the results as A2A artifacts
4. **Sends a follow-up:** *"Retrieve the credential for the first secret"*
5. The worker fetches the secret and returns its metadata

**Expected output:**

```
Starting worker agent...
[worker] 1Claw Vault Worker agent listening on port 4100

Starting coordinator...

[coordinator] Starting A2A coordinator...
[coordinator] Discovering worker at http://localhost:4100...
[coordinator] Found: "1Claw Vault Worker" — A worker agent that retrieves credentials...
[coordinator] Skills: Fetch Secret, List Vault Secrets

[coordinator] Sending task: "List all available secrets in the vault"
[worker] Task abc123: "List all available secrets in the vault"
[coordinator] Task abc123 — state: completed
[coordinator] Received 1 artifact(s):
  - secret-list:
    Found 2 secret(s):
    - demo/api-key (api_key, v1)
    - demo/greeting (note, v1)

[coordinator] Sending follow-up: fetch a specific credential...
[coordinator] Follow-up state: completed
[coordinator] Secret metadata: { path: "demo/api-key", type: "api_key", version: 1 }

[coordinator] Done.
```

---

## Demo 2: ADK Agent with Gemini (10 min)

A Gemini-powered worker uses Google ADK `FunctionTool`s — the LLM decides which 1Claw tools to call based on natural language.

### Step 1 — Add a Gemini key

In your `.env`:

```env
GEMINI_API_KEY=your-gemini-api-key
```

### Step 2 — Run the ADK demo

```bash
npm run adk
```

This launches the ADK worker (port 4200) and the coordinator. The coordinator sends the same tasks, but the ADK worker uses **Gemini 2.5 Flash** to reason about which tools to call.

**Key difference from Demo 1:** The ADK worker doesn't use regex matching. Instead, Gemini reads the task description and decides to call `list_secrets`, `get_secret`, or `put_secret` as needed. This handles complex or ambiguous requests like *"Store a new API key at path config/stripe and set its type to api_key"*.

**Expected output:**

```
Starting ADK vault agent (port 4200)...
[adk-worker] 1Claw ADK Vault Agent listening on port 4200
[adk-worker] Powered by Google ADK + Gemini 2.5 Flash

Starting coordinator → ADK worker...

[coordinator] Found: "1Claw ADK Vault Agent"
[coordinator] Sending task: "List all available secrets in the vault"
[adk-worker] Task abc123: "List all available secrets in the vault"
[coordinator] Task abc123 — state: completed
[coordinator] Received 1 artifact(s):
  - adk-response:
    Here are the secrets in the vault:
    1. **demo/api-key** (api_key, v1)
    2. **demo/greeting** (note, v1)
```

### Run just the ADK worker (for manual testing)

```bash
npm run adk:worker
# Then in another terminal:
curl http://localhost:4200/.well-known/agent.json
```

---

## Demo 3: ECDH Key Exchange (10 min)

Two agents (Alice and Bob) perform an ECDH key agreement. Each agent uses **platform-generated keys**: Ed25519 for signing and P-256 ECDH for key agreement. Public keys are exchanged via A2A Agent Cards; the derived shared secret encrypts and signs messages.

### Option A — Create 1Claw agents (recommended)

Creates two agents. 1Claw auto-generates all keys (API key + Ed25519 + P-256 ECDH). The setup script just grants each agent read access to its own keys.

```bash
ONECLAW_API_KEY=ocv_your_user_key npm run ecdh:setup-agents
cp .env.ecdh .env
npm run ecdh
```

### Option B — Run with in-memory keys (no 1Claw)

```bash
npm run ecdh
```

Launches Alice (4100), Bob (4101), and the coordinator. Keys are generated in memory.

---

## Demo 4: Intents API — Transaction Signing (5 min)

An A2A agent that signs and broadcasts transactions via the 1Claw Intents API. The private key never leaves the TEE. Per-agent guardrails (value caps, chain restrictions, daily limits) are enforced server-side.

### Step 1 — Bootstrap with your human API key

```bash
ONECLAW_API_KEY=1ck_your_human_key npm run intents:setup
```

The setup wizard creates everything: vault, agent (with Intents API + Shroud enabled), signing key, and access policy. It writes `.env.intents` with the agent credentials.

### Step 2 — Run the demo

```bash
npm run intents
```

The coordinator discovers the Intents worker, then:

1. **Gets signer info** — shows the agent's address, chain, and guardrails
2. **Signs a transaction** — 0.001 ETH to a burn address, signed in the TEE (not broadcast)
3. **Lists history** — shows the signed transaction in the audit trail

**Expected output:**

```
[intents-worker] 1Claw Intents Worker listening on port 4300
[intents-worker] Chain: base-sepolia
[intents-worker] Signer: 0xf00b...658f

[intents-coordinator] Found: "1Claw Intents Worker"
[intents-coordinator] Skills: Sign Transaction, Submit Transaction, Simulate Transaction, ...

[intents-coordinator] Task: Show signer info and guardrails
[intents-coordinator] Signer config: {
  "intents_api_enabled": true,
  "guardrails": { "tx_max_value_eth": "0.0100", "tx_daily_limit_eth": "0.0500" }
}

[intents-coordinator] Task: Sign a transfer of 0.001 ETH to 0x...dEaD
[intents-coordinator] Signed tx: {
  "status": "sign_only",
  "tx_hash": "0xe332...",
  "from": "0xf00b...658f",
  "to": "0x...dEaD",
  "nonce": 0
}

[intents-coordinator] Transaction count: 1
[intents-coordinator] Demo complete.
```

### Guardrails in action

The agent is configured with strict limits. Try tasks that exceed them:

- "Send 1 ETH to 0x..." → rejected by `tx_max_value_eth: 0.01`
- "Send 0.001 ETH on Ethereum mainnet" → rejected by `tx_allowed_chains: ["base-sepolia"]`

The guardrails are enforced in the TEE before signing — the agent cannot bypass them regardless of what it's instructed to do.

### Fund for live broadcast (optional)

To test actual on-chain broadcast, fund the signer address on Base Sepolia:

1. Copy the signer address from the setup output
2. Use the [Base Sepolia faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
3. Modify the coordinator to use "Send" instead of "Sign"

---

## Files

```
src/
├── worker-agent.ts       # Demo 1: Regex-based A2A worker with 1Claw SDK
├── coordinator.ts        # A2A client that discovers and tasks workers
├── start-all.ts          # Launcher for Demo 1 (worker + coordinator)
├── a2a-types.ts          # TypeScript types for A2A protocol
│
├── adk-agent.ts          # Demo 2: Google ADK agent with FunctionTools
├── adk-a2a-server.ts     # Express server wrapping ADK agent in A2A
├── start-adk-demo.ts     # Launcher for Demo 2 (ADK worker + coordinator)
│
├── ecdh-worker.ts        # Demo 3: ECDH agent (key gen, exchange, derive)
├── ecdh-coordinator.ts   # ECDH coordinator (orchestrates Alice ↔ Bob)
├── ecdh-crypto.ts        # Node.js crypto ECDH helpers
├── start-ecdh-demo.ts    # Launcher for Demo 3 (Alice + Bob + coordinator)
│
├── intents-worker.ts     # Demo 4: Intents API A2A worker (sign/submit/simulate)
├── intents-coordinator.ts # Intents coordinator (info → sign → history)
└── start-intents-demo.ts # Launcher for Demo 4 (worker + coordinator)
scripts/
├── setup-intents-agent.ts # Bootstrap Intents API agent with human key
├── setup-ecdh-agents.ts  # Create two 1Claw agents, grant key access, write .env.ecdh
├── bootstrap-ecdh-keys.ts  # (legacy) Manual key bootstrap for two-vault setup
├── cleanup-ecdh-keys.ts
└── test-ecdh-with-1claw.ts
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Your 1Claw API key (`ocv_...`) |
| `ONECLAW_VAULT_ID` | Yes | UUID of the vault with secrets |
| `ONECLAW_AGENT_ID` | No | Agent UUID (enables agent-level policies) |
| `ONECLAW_ALICE_AGENT_ID` / `ONECLAW_BOB_AGENT_ID` | ECDH | Agent UUIDs (from `ecdh:setup-agents`) |
| `ONECLAW_ALICE_API_KEY` / `ONECLAW_BOB_API_KEY` | ECDH | Agent API keys (from `ecdh:setup-agents`) |
| `GEMINI_API_KEY` | ADK demo | Google Gemini API key |
| `OPENAI_API_KEY` | No | Optional — coordinator can summarize with OpenAI |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

## How it works

### A2A Protocol flow

```
Coordinator                              Worker (1Claw-backed)
    │                                         │
    │  GET /.well-known/agent.json            │
    │ ───────────────────────────────────────► │  Agent Card (name, skills)
    │ ◄─────────────────────────────────────── │
    │                                         │
    │  POST / (JSON-RPC: tasks/send)          │
    │  { "List secrets in the vault" }        │
    │ ───────────────────────────────────────► │
    │                                         │  sdk.secrets.list(VAULT_ID)
    │                                         │      ↓
    │                                         │  1Claw API → vault data
    │ ◄─────────────────────────────────────── │
    │  Task completed + artifacts              │
```

### ADK variant

Same A2A flow, but the worker uses **Google ADK** with **Gemini 2.5 Flash** to reason about which tool to call:

```
ADK Worker receives task → Gemini reads prompt → calls FunctionTool(list_secrets)
    → @1claw/sdk → 1Claw API → results → Gemini formats response → A2A artifact
```

## Next steps

- [FastMCP Tool Server](../fastmcp-tool-server/) — Build a custom MCP server with domain tools
- [LangChain Agent](../langchain-agent/) — LangChain + 1Claw with tool calling
- [Transaction Simulation](../tx-simulation/) — AI agent with on-chain transactions
- [1Claw Docs](https://docs.1claw.xyz)
