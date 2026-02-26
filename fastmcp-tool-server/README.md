# 1Claw + FastMCP Tool Server

> **Reference only** — not for production use. Review and adapt for your own security requirements.

A custom MCP server built with [FastMCP](https://github.com/punkpeye/fastmcp) that wraps the `@1claw/sdk` into higher-level, domain-specific tools. Instead of raw vault CRUD, agents get business-logic operations like **rotate an API key**, **deploy a service**, and **parse an env config** — all backed by 1Claw.

## What you'll learn

- Build an MCP server that composes SDK calls into domain tools
- Run the server over **stdio** (Claude Desktop, Cursor) or **HTTP streaming** (remote clients)
- Expose vault metadata as an MCP **resource** (`vault://info`)

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with a vault and agent
- Build the SDK first: `cd packages/sdk && npm run build && cd ../..`

## Demo walkthrough (5–10 min)

### Step 1 — Install and configure

```bash
cd examples/fastmcp-tool-server
npm install
cp .env.example .env
```

Open `.env` and choose one auth method:

**Option A — API key + agent ID (recommended):**

```env
ONECLAW_API_KEY=ocv_your_key_here
ONECLAW_AGENT_ID=your-agent-uuid
ONECLAW_VAULT_ID=your-vault-uuid
```

**Option B — Pre-set agent JWT:**

```env
ONECLAW_AGENT_TOKEN=your-jwt-here
ONECLAW_VAULT_ID=your-vault-uuid
```

### Step 2 — Seed a test secret

Make sure you have at least one secret in your vault:

```bash
# Via CLI
1claw secret put demo/api-key --vault YOUR_VAULT_ID --value "sk-test-12345" --type api_key
```

Or create one via the [1Claw dashboard](https://1claw.xyz).

### Step 3 — Start the server (HTTP streaming)

```bash
MCP_TRANSPORT=httpStream PORT=3001 npm start
```

You'll see:

```
1claw-devops MCP server on port 3001 (HTTP streaming)
```

### Step 4 — Test the tools with curl

**Initialize an MCP session:**

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{}}}'
```

Save the `mcp-session-id` from the response header.

**List secrets:**

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: SESSION_ID_HERE" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_secrets","arguments":{}}}'
```

**Rotate an API key:**

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: SESSION_ID_HERE" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"rotate_api_key","arguments":{"path":"demo/api-key","provider":"openai"}}}'
```

**Expected:** `Rotated demo/api-key from v1 to v2`

### Step 5 — (Optional) Add to Claude Desktop or Cursor

For **stdio** mode (the default), add to your MCP config:

```json
{
  "mcpServers": {
    "1claw-devops": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/path/to/examples/fastmcp-tool-server",
      "env": {
        "ONECLAW_API_KEY": "ocv_...",
        "ONECLAW_AGENT_ID": "your-agent-uuid",
        "ONECLAW_VAULT_ID": "your-vault-uuid"
      }
    }
  }
}
```

Now ask Claude: *"Rotate the API key at demo/api-key"* and it will call the tool.

## Tools

| Tool | Description |
|------|-------------|
| `list_secrets` | List all secrets in the vault (paths, types, versions — never values) |
| `get_secret` | Fetch the decrypted value of a secret by path |
| `put_secret` | Store or update a secret |
| `rotate_api_key` | Fetch current key → "regenerate" → store new value (bumps version) |
| `get_env_config` | Parse an `env_bundle` secret into a JSON key-value object |
| `deploy_service` | Fetch a deploy key, simulate deployment, store the deploy log |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_VAULT_ID` | Yes | UUID of the vault to operate on |
| `ONECLAW_API_KEY` | Yes* | API key (`ocv_...`). Use with `ONECLAW_AGENT_ID`. |
| `ONECLAW_AGENT_ID` | No | Agent UUID. With API key, server fetches JWT at startup. |
| `ONECLAW_AGENT_TOKEN` | Yes* | Pre-set agent JWT. Alternative to API key + agent ID. |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |
| `MCP_TRANSPORT` | No | `stdio` (default) or `httpStream` |
| `PORT` | No | HTTP port for streaming mode (default: `3001`) |

## How it works

```
AI Client (Claude, Cursor, etc.)
    │
    │  stdio or HTTP streaming
    ▼
FastMCP Server
    │
    ├── list_secrets ──────→ sdk.secrets.list()
    ├── get_secret ────────→ sdk.secrets.get()
    ├── put_secret ────────→ sdk.secrets.set()
    ├── rotate_api_key ────→ get() + generate new + set()
    ├── get_env_config ────→ get() + parse KEY=VALUE lines
    ├── deploy_service ────→ get(key) + simulate + set(log)
    │
    └── resource vault://info → sdk.secrets.list() (metadata)
```

Standard tools are thin pass-throughs. Domain tools compose multiple SDK calls into a single tool invocation — the LLM makes one call and the server handles the multi-step logic.

## Next steps

- [LangChain Agent](../langchain-agent/) — Connect LangChain to this server
- [Google A2A](../google-a2a/) — Agent-to-Agent with 1Claw
- [Next.js Agent Secret](../nextjs-agent-secret/) — AI chat app with vault access
- [1Claw Docs](https://docs.1claw.xyz)
