# Local security inspector (offline)

> **Reference only** — not for production use.

Runs the same **local-only** inspection helpers used by `@1claw/mcp` with `ONECLAW_LOCAL_ONLY=true`: prompt injection, social engineering, PII, encoding tricks, and network patterns — **no 1Claw account, API keys, or network**.

## Quick start

```bash
cd examples/local-inspect
npm install
npm start
```

No `.env` file is required. The script prints sample threat checks to the terminal.

### Optional: run one category

```bash
npm run test-injection
npm run test-social
npm run test-pii
npm run test-encoding
npm run test-network
npm run test-clean
```

### Use in MCP (Claude, Cursor, …)

After `npm install`, you can point MCP at the published server with local-only mode (see console output at end of `npm start`):

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

The `inspect_content` tool is available without vault credentials.

## What you’ll learn

- How offline threat checks behave on fixed sample strings
- How to enable **local-only** MCP inspection without calling the 1Claw API

## Next steps

- [Shroud security example](../shroud-security/) — broader samples using `@1claw/mcp/security`
- [1Claw MCP](https://mcp.1claw.xyz) — full vault tools when not in local-only mode
