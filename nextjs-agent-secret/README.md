# 1Claw Agent Secret Demo

> **Reference only** — not for production use. Review and adapt for your own security requirements.

A Next.js chat app where an AI agent (Claude via Vercel AI SDK) accesses secrets stored in a 1Claw vault. Secrets are fetched server-side and **never exposed to the browser or the model's response stream**. Gated secrets trigger a human approval flow.

## What you'll learn

- Integrate the `@1claw/sdk` with the Vercel AI SDK as server-side tools
- Keep decrypted secrets out of the client — cache them server-side only
- Handle `approval_required` and `payment_required` responses gracefully
- Build a chat UI that interacts with a secure vault

## Prerequisites

- Node.js 20+
- A [1Claw account](https://1claw.xyz) with a vault and at least one secret
- An [Anthropic API key](https://console.anthropic.com/) for Claude
- Build the SDK first: `cd packages/sdk && npm run build && cd ../..`

## Demo walkthrough (5 min)

### Step 1 — Install and configure

```bash
cd examples/nextjs-agent-secret
npm install
cp .env.local.example .env.local
```

Open `.env.local` and fill in your credentials:

```env
ONECLAW_API_KEY=ocv_your_key_here
ONECLAW_BASE_URL=https://api.1claw.xyz
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Step 2 — Make sure you have a secret

Create a test secret via the [dashboard](https://1claw.xyz) or CLI:

```bash
1claw secret put demo/greeting --vault YOUR_VAULT_ID --value "Hello from 1Claw!" --type note
```

### Step 3 — Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Step 4 — Chat with the agent

Try these prompts in order:

1. **"List my vaults"** — The agent calls `listVaults` and shows your vault names and IDs.

2. **"List the secrets in vault `<paste-vault-id>`"** — The agent calls `listSecretKeys` and shows paths, types, and versions (never values).

3. **"Fetch the secret `demo/greeting` from vault `<paste-vault-id>`"** — The agent calls `getSecret`. The decrypted value is cached server-side. The model responds with something like: *"I've retrieved the secret demo/greeting (type: note). It's available server-side for use."*

4. **"What's the raw value?"** — Claude will refuse. The system prompt instructs it to never reveal secret values.

### What you'll see

The chat UI shows Claude's reasoning with tool call indicators:

```
You: List my vaults
Claude: [calls listVaults] You have 2 vaults:
  • Production (a1b2c3d4-...)
  • Demo (e5f6g7h8-...)

You: List secrets in vault e5f6g7h8-...
Claude: [calls listSecretKeys] Found 1 secret:
  • demo/greeting (note, v1)

You: Fetch demo/greeting from vault e5f6g7h8-...
Claude: [calls getSecret] I've retrieved the secret "demo/greeting" successfully.
  It's available server-side for use. I won't display the actual value.
```

## How it works

```
Browser (Chat UI)
    │  useChat() — Vercel AI SDK
    ▼
/api/chat (POST, streaming)
    │
    ├── Claude decides to call tools
    │
    ├── listVaults     →  sdk.vault.list()       →  1Claw API
    ├── listSecretKeys →  sdk.secrets.list()      →  1Claw API
    └── getSecret      →  sdk.secrets.get()       →  1Claw API
          │
          ├── 200: value cached in server-side Map (never sent to client)
          ├── 402: returns "payment_required" to model
          └── 403: returns "pending_approval" to model
```

The `getSecret` tool stores the decrypted value in a server-side `Map` keyed by `vaultId:secretPath`. The model only sees a status string like `"available"` — the raw value never enters the response stream.

## Files

| File | Purpose |
|------|---------|
| `lib/oneclaw.ts` | Singleton `@1claw/sdk` client (server-side only) |
| `lib/tools.ts` | AI SDK tool definitions wrapping 1Claw: `getSecret`, `listVaults`, `listSecretKeys` |
| `app/api/chat/route.ts` | Streaming chat route with Claude + 1Claw tools |
| `app/page.tsx` | Chat UI component |
| `components/Chat.tsx` | `useChat()` hook, message rendering |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Your 1Claw API key (`ocv_...`) |
| `ONECLAW_BASE_URL` | No | API URL (default: `https://api.1claw.xyz`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |

## Key code pattern

```typescript
// lib/tools.ts — AI SDK tool that wraps 1Claw
import { tool } from "ai";
import { z } from "zod";
import { oneclaw } from "./oneclaw";

const secretCache = new Map<string, string>();

export const oneclawTools = {
  getSecret: tool({
    description: "Fetch a secret from the 1Claw vault.",
    parameters: z.object({
      vaultId: z.string(),
      key: z.string(),
      reason: z.string(),
    }),
    execute: async ({ vaultId, key, reason }) => {
      const res = await oneclaw.secrets.get(vaultId, key, { reason });
      if (res.error) return { status: "error", message: res.error.message };
      secretCache.set(`${vaultId}:${key}`, res.data.value);
      return { status: "available", hint: `Secret "${key}" retrieved.` };
    },
  }),
};
```

## Next steps

- [LangChain Agent](../langchain-agent/) — Same pattern with LangChain instead of Vercel AI SDK
- [Transaction Simulation](../tx-simulation/) — AI agent with on-chain transactions and guardrails
- [1Claw Docs](https://docs.1claw.xyz)
