# Browser Bridge Example

Demonstrates [`@1claw/browser-bridge`](https://www.npmjs.com/package/@1claw/browser-bridge) — the agent drives the browser with a real, unmodified `puppeteer-core`, and a **separate process** types the password. The agent asks for a fill by binding id only; it never receives the value, never picks the page, and never reads the field it filled.

**No 1Claw account and no network calls to 1Claw are required to run this.** The demo uses `MockVaultDriver` to hold a password in memory locally — a real integration swaps that one line for a binding backed by your own 1Claw vault (see [Going further](#going-further) below); nothing else in the flow changes.

## What this shows

1. A local login page is served (nothing 1Claw-specific about it — this stands in for any real site).
2. `puppeteer-core` — the actual library, connected the way any browser-driving agent framework connects to a CDP endpoint (`browserWSEndpoint`) — opens the page. This is the "agent drives" half.
3. Instead of reading the `#password` field and typing into it, the script calls the bridge's `request_fill` tool, naming only which binding to use.
4. The full tool result is printed, and the script checks it for the literal password string — so you don't have to take the "the agent never sees it" claim on faith.
5. The same request is repeated from a page the binding doesn't allow (`https://evil.test`), to show the other half: the agent can't just ask for a fill anywhere it likes.

## Prerequisites

- Node.js 20+
- A local Chrome or Chromium install. The script checks the usual default paths (macOS: `/Applications/Google Chrome.app/...`, Linux: `/usr/bin/google-chrome`) — if yours is elsewhere, pass `--chrome /path/to/chrome` or set `ONECLAW_BRIDGE_CHROME`.

## Setup

```bash
npm install
npm start
```

Expected output ends with:

```
  password present in the agent's result: no
  same fill requested from an unlisted host: {"status":"denied", ...}

  OK: the agent drove the browser and logged in — it never held the password
```

## Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `ONECLAW_BRIDGE_CHROME` | No | Path to a Chrome/Chromium binary, if not at the default location for your platform |

## Going further

This example uses `MockVaultDriver` (in-memory, no persistence, not for production — see the package's own docs) so it runs standalone. Two other backends ship in the same package:

- `LocalVaultDriver` — your own credentials, your own machine, encrypted at rest with a passphrase you hold. No account either.
- A hosted backend, backed by your 1Claw vault — swap in real bindings created via `1claw browser binding create` (see the [CLI docs](https://docs.1claw.co)) so the credential comes from your vault instead of a value in this script.

Everything downstream of `startBridge({ ..., backend })` — the puppeteer connection, the `request_fill` call, the host-allowlist check — is identical regardless of which backend is behind it.

See [`docs.1claw.co/docs/agents/browser-bridge`](https://docs.1claw.co/docs/agents/browser-bridge) and [1claw.co/developers/browser-bridge](https://1claw.co/developers/browser-bridge) for the full picture, including how Browser Bridge compares to Computer Use and browser-use's own `sensitive_data` handling.
