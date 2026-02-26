# 1Claw + LangChain Agent

> **Reference only** — not for production use. Review and adapt for your own security requirements.

A LangChain agent that fetches secrets from a 1Claw vault on demand. The LLM decides when to call vault tools — listing secrets and retrieving them just-in-time. Supports **OpenAI** or **Gemini** (free tier).

## What you'll learn

- Define custom LangChain tools that wrap the `@1claw/sdk`
- Let an LLM agent decide when to list and fetch vault secrets
- Connect LangChain to the hosted 1Claw MCP server (all 11 tools, zero config)

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with a vault containing at least one secret
- An LLM API key: **OpenAI** (`OPENAI_API_KEY`) or **Gemini free tier** ([aistudio.google.com/apikey](https://aistudio.google.com/apikey))
- Build the SDK first: `cd packages/sdk && npm run build && cd ../..`

## Demo walkthrough (5 min)

### Step 1 — Install and configure

```bash
cd examples/langchain-agent
npm install --legacy-peer-deps
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
ONECLAW_API_KEY=ocv_your_key_here
ONECLAW_VAULT_ID=your-vault-uuid
GOOGLE_API_KEY=your-gemini-key     # or OPENAI_API_KEY=sk-...
```

> **Tip:** You can reuse another example's `.env` and just add the LLM key:
> ```bash
> GOOGLE_API_KEY=... npx tsx --env-file=../ampersend-x402/.env src/tool-calling.ts
> ```

### Step 2 — Make sure you have a secret in your vault

If your vault is empty, create a quick test secret via the [1Claw dashboard](https://1claw.xyz) or CLI:

```bash
# Using the CLI
1claw secret put demo/hello-world --vault YOUR_VAULT_ID --value "Hello from 1Claw!" --type note
```

### Step 3 — Run the tool-calling agent

```bash
npm start
```

The agent will:

1. Call `list_vault_secrets` to see what's in the vault
2. Call `get_secret` on the first secret it finds
3. Report the path and type — **never the raw value**

**Expected output:**

```
=== 1Claw + LangChain Agent ===

LLM: Gemini (GOOGLE_API_KEY)

Asking: list vault secrets, then fetch the first secret and report its path and type (not the value).

  Invoking: list_vault_secrets
  Found 1 secret(s): demo/hello-world (note, v1)

  Invoking: get_secret with { path: "demo/hello-world" }

--- Agent Response ---
I found 1 secret in your vault. The first secret has path: demo/hello-world, type: note.
I've retrieved it but I'm not displaying the value as instructed.
```

### Step 4 — (Optional) Run the MCP client approach

```bash
npm run mcp
```

This connects LangChain to the hosted 1Claw MCP server at `mcp.1claw.xyz`. The agent automatically gets all 11 vault tools (list_secrets, get_secret, put_secret, etc.) without defining them manually.

> **Requires:** `ONECLAW_AGENT_TOKEN` (a pre-set JWT) and `OPENAI_API_KEY`.

## Two approaches

| Script | How it works | LLM support |
|--------|-------------|-------------|
| `src/tool-calling.ts` | Custom LangChain tools wrapping `@1claw/sdk` — you control which tools the agent has | OpenAI or Gemini |
| `src/mcp-client.ts` | Connects to the hosted 1Claw MCP server — all 11 tools loaded automatically | OpenAI only |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes (tool-calling) | Your 1Claw API key (`ocv_...`) |
| `ONECLAW_VAULT_ID` | Yes | UUID of the vault to read from |
| `ONECLAW_AGENT_ID` | No | Agent UUID (enables agent-level policies) |
| `OPENAI_API_KEY` | One LLM required | OpenAI API key |
| `GOOGLE_API_KEY` | One LLM required | Gemini free tier key |
| `ONECLAW_AGENT_TOKEN` | MCP only | Agent JWT for MCP server auth |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |

## How it works

```
User prompt
    │
    ▼
LangChain Agent (Gemini or OpenAI)
    │
    ├── list_vault_secrets()  →  @1claw/sdk  →  1Claw API
    │       returns paths, types, versions (never values)
    │
    └── get_secret(path)      →  @1claw/sdk  →  1Claw API
            returns { path, type, value, version }
            (agent reports path/type only)
```

The LLM receives the tool results and decides how to respond. The system prompt instructs it to never reveal raw secret values.

## Key code pattern

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createClient } from "@1claw/sdk";
import { z } from "zod";

const client = createClient({ baseUrl: BASE_URL, apiKey: API_KEY });

const listSecretsTool = new DynamicStructuredTool({
  name: "list_vault_secrets",
  description: "List all secrets in the vault (metadata only, never values).",
  schema: z.object({}),
  func: async () => {
    const res = await client.secrets.list(VAULT_ID);
    return res.data.secrets.map(s => `${s.path} (${s.type})`).join("\n");
  },
});
```

## Next steps

- [FastMCP Tool Server](../fastmcp-tool-server/) — Build your own MCP server with domain-specific tools
- [Google A2A](../google-a2a/) — Agent-to-Agent communication with 1Claw
- [Next.js Agent Secret](../nextjs-agent-secret/) — AI chat app with vault access and approval gates
- [1Claw Docs](https://docs.1claw.xyz)
