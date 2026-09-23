# Shroud examples

> **Reference only** — not for production use.

[Shroud](https://github.com/1clawAI/shroud) is 1Claw's TEE proxy (AMD SEV-SNP
on Confidential GKE) for two things: the **Intents API** (agents request
transaction signing; Shroud signs inside the TEE so private keys never leave
encrypted memory) and the **LLM proxy** (agents call OpenAI/Anthropic/Google/
etc. through Shroud, which inspects traffic and can resolve provider API keys
from the Vault so agents never hold them).

Four scenarios live here, each its own runnable project (`cd` into one,
`npm install`, `npm start`) — pick the one closest to what you're building
rather than reading all four:

| Scenario | What it shows | Needs live Shroud? |
|---|---|---|
| [`01-basic-demo`](./01-basic-demo/) | The general tour: health checks, Intents API (list/simulate/submit/sign a transaction), and a basic LLM proxy call. Start here if you're new to Shroud. | Yes |
| [`02-llm-billing`](./02-llm-billing/) | LLM Token Billing specifically — verifying the `llm_token_billing`/`stripe_customer_id` JWT claims and routing OpenAI/Anthropic/Google traffic through Stripe's AI Gateway so agents never hold a provider key. | Yes |
| [`03-router-key`](./03-router-key/) | The **router-key** auth path: mint a static `sk-shroud-v1-…` Bearer key, point an unmodified `openai` SDK straight at the gateway, stream a completion inspected frame-by-frame inside the TEE, then revoke the key. A different auth model from the other three (no agent JWT exchange). | Yes |
| [`04-security-offline`](./04-security-offline/) | The inspection primitives themselves (prompt injection, command injection, social engineering, encoding/homoglyph checks) — the same detectors behind Shroud and the MCP `inspect_content` tool. Runs **fully offline**, no Vault, no API keys, no live Shroud call at all. Architecturally different from the other three — read this one if you want to understand *what* gets inspected, not how to call Shroud. | No |

## Which one do I want?

- Calling an LLM or signing a transaction through Shroud for the first time → **01-basic-demo**.
- Your org has LLM Token Billing enabled and you want to confirm it's wired up → **02-llm-billing**.
- You're building a stock OpenAI-SDK integration and want the simplest possible auth (one static key, no JWT exchange) → **03-router-key**.
- You want to understand what Shroud actually flags in a request/response, with no account needed → **04-security-offline**.

## Prerequisites common to 01–03

A [1Claw](https://1claw.co) agent with Shroud enabled. Each scenario's own
README has the exact setup command and required env vars — they're not
identical (e.g. `03-router-key` needs `shroud_enabled: true` and a router key,
`02-llm-billing` needs the org's LLM Token Billing toggle on).

## Other examples

- [Local inspect](../local-inspect/) — smaller, more focused inspection test scripts than `04-security-offline`.
- [Basic example](../basic/) — Vault, secrets, and billing with the SDK (no Shroud).
- [Transaction simulation](../tx-simulation/) — Full Intents API + guardrails in a chat UI.
