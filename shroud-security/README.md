# Shroud security inspection (local)

> **Reference only** — not for production use.

Demonstrates **`@1claw/mcp/security`** — the same inspection primitives as the MCP `inspect_content` tool: prompt injection, command injection, social engineering, encoding, Unicode/homoglyphs, and related checks. Runs **fully offline**; no vault or API keys required.

## Quick start

```bash
cd examples/shroud-security
npm install
npm start
```

No `.env` file is required.

### Build (optional)

```bash
npm run build
```

TypeScript emits to `dist/`; `npm start` uses `tsx` and does not require a separate build.

## What you’ll learn

- How **input** vs **output** inspection classifies threats
- How verdicts (clean / warning / suspicious / malicious) map to detector hits

## MCP: local-only mode

To use inspection from an MCP client without 1Claw credentials:

```json
{
  "mcpServers": {
    "1claw": {
      "command": "npx",
      "args": ["-y", "@1claw/mcp"],
      "env": { "ONECLAW_LOCAL_ONLY": "true" }
    }
  }
}
```

## Next steps

- [Local inspect](../local-inspect/) — smaller focused test scripts
- [Shroud demo](../shroud-demo/) — health, Intents API, and LLM proxy against live Shroud
