# 1Claw + Google A2A (Agent-to-Agent)

> **Reference only** — not for production use. Review and adapt for your own security requirements.

Three demos showing AI agents communicating via [Google's A2A protocol](https://google.github.io/A2A/), using 1Claw as the secure credential layer. A coordinator agent discovers a worker agent, sends it tasks, and the worker fetches secrets from a 1Claw vault to complete them.

## What you'll learn

- Implement the A2A protocol (Agent Card discovery, JSON-RPC task handling)
- Build a worker agent backed by the `@1claw/sdk` for vault operations
- Use Google ADK (Agent Development Kit) with Gemini to reason about tasks via LLM
- Coordinate two agents doing ECDH key exchange with vault-stored keys

## Three demos

| Demo | Command | Description |
|------|---------|-------------|
| **Vault Worker** | `npm start` | Regex-based worker lists/fetches secrets; coordinator sends tasks via A2A |
| **ADK Agent** | `npm run adk` | Gemini-powered worker uses ADK `FunctionTool`s to reason about vault tasks |
| **ECDH Key Exchange** | `npm run ecdh` | Two agents (Alice, Bob) perform ECDH key agreement — keys optionally stored in 1Claw |

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with a vault containing at least one secret
- For the ADK demo: a [Gemini API key](https://aistudio.google.com/apikey)
- Build the SDK first: `cd packages/sdk && npm run build && cd ../..`

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

Two agents (Alice and Bob) perform an ECDH key agreement. Each generates an ephemeral key pair, exchanges public keys via A2A, and derives a shared secret. Keys can optionally be stored in 1Claw vaults.

### Step 1 — Run with in-memory keys (no extra config)

```bash
ONECLAW_VAULT_ID= ONECLAW_API_KEY= npm run ecdh
```

This launches Alice (port 4100), Bob (port 4101), and the ECDH coordinator. Keys are generated in memory.

### Step 2 — (Optional) Run with 1Claw-stored keys

Set in `.env`:

```env
ONECLAW_ALICE_VAULT_ID=vault-for-alice
ONECLAW_ALICE_API_KEY=ocv_alice_key
ONECLAW_BOB_VAULT_ID=vault-for-bob
ONECLAW_BOB_API_KEY=ocv_bob_key
```

Then bootstrap and run:

```bash
npm run ecdh:bootstrap   # Generate and store keys in 1Claw
npm run ecdh             # Run the demo with vault-stored keys
npm run ecdh:cleanup     # Remove keys from vaults
```

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
└── start-ecdh-demo.ts    # Launcher for Demo 3 (Alice + Bob + coordinator)
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Your 1Claw API key (`ocv_...`) |
| `ONECLAW_VAULT_ID` | Yes | UUID of the vault with secrets |
| `ONECLAW_AGENT_ID` | No | Agent UUID (enables agent-level policies) |
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
