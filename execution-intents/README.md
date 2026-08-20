# Execution Intents Example

Execution Intents let AI agents make HTTP calls, GraphQL queries, and other external service interactions through pre-configured **bindings** — without ever seeing the credentials. The credentials are stored server-side (encrypted in the vault) and injected at execution time.

## What this demonstrates

| Feature | What happens |
|---------|-------------|
| **HTTP binding** | Agent calls httpbin via a named binding — response flows back, credentials stay server-side |
| **Credential injection** | GitHub PAT and OpenWeatherMap key are injected at request time; the agent process never sees them |
| **GraphQL binding** | Agent runs a GraphQL query through a binding with host-allowlist guardrails |
| **Guardrail enforcement** | Attempt to call an unauthorized host is blocked with 403 |
| **Execution audit** | Every execution (success or blocked) is logged for compliance |
| **Credential rotation** | Rotate a credential without touching or restarting the agent |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set ONECLAW_API_KEY (a human 1ck_ key on Pro+ tier)

# 3. Run the full walkthrough
npm start

# 4. Or run the streamlined live demo (with colors)
npm run demo
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Yes | Human API key (`1ck_…`) with Pro+ subscription |
| `ONECLAW_BASE_URL` | No | API base (default: `https://api.1claw.xyz`) |
| `GITHUB_TOKEN` | No | GitHub PAT for the credential injection demo |
| `OPENWEATHER_API_KEY` | No | OpenWeatherMap key for the weather demo |

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Process                                               │
│                                                              │
│  "I need to call GitHub API"                                 │
│          │                                                   │
│          ▼                                                   │
│  POST /v1/agents/{id}/execute                                │
│  { binding: "github", params: { method: "GET", path: ... } }│
│                                                              │
│  ← Result JSON (no token visible)                            │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  1Claw Vault (or TEE)                                        │
│                                                              │
│  1. Resolve binding "github" → config + credential           │
│  2. Validate guardrails (allowed_hosts, paths, rate)         │
│  3. Inject credential (bearer token into Authorization)      │
│  4. Forward request to https://api.github.com                │
│  5. Sanitize response headers                                │
│  6. Return result to agent                                   │
│  7. Log execution event for audit                            │
└─────────────────────────────────────────────────────────────┘
```

## Scripts

- **`npm start`** — Full walkthrough: create agent, bindings, test, execute, guardrail demo, audit, cleanup
- **`npm run demo`** — Presentation-friendly version with colored output and real API calls

## Binding types supported (Pro+)

| Type | Status | Description |
|------|--------|-------------|
| `http` | Live | REST API calls with bearer/header/query/basic credential injection |
| `graphql` | Live | GraphQL queries with `{ query, variables, operationName }` |
| `postgres` | Live | SQL queries via sqlx (set `read_only` guardrail for safe testing) |
| `mysql` | Live | MySQL queries via sqlx |
| `redis` | Live | Redis commands (`PING`, `GET`, …) |
| `grpc` | Live | gRPC-JSON transcoding (Connect-style POST) |
| `smtp` | Live | Plain TCP SMTP + AUTH PLAIN (no STARTTLS — use HTTP for TLS email APIs) |
| `cloud_sdk` | Live | AWS SigV4 / GCP SA / Azure client credentials → signed HTTPS |
| `s3` | Live | S3-compatible get/put/list/delete (R2, AWS, B2) |
| `custom` | Live | Flexible HTTP with configurable credential injection |

### Testing with real services

1. Copy `examples/execution-intents/.env.example` → `.env` and fill credentials (Neon, Upstash, R2, etc.).
2. Bootstrap bindings: `./scripts/bootstrap-execution-intents-bindings.sh`
3. Run prod regression: `./scripts/test-execution-intents-prod.sh`

Production Vault blocks `localhost` and private IPs — use managed services with **public hostnames** even when testing locally.

## TEE enforcement

For maximum security, enable `execution_require_tee` on the agent — all execute requests must route through the Shroud TEE, and direct secret reads are blocked:

```typescript
await client.agents.update(agentId, {
    execution_require_tee: true, // Pro+ required
});
```

## Related examples

- [`intents-quick`](../intents-quick/) — Transaction signing via Intents API
- [`intents-layers`](../intents-layers/) — Multi-chain transaction guardrails
- [`shroud-demo`](../shroud-demo/) — Shroud LLM proxy with threat detection
