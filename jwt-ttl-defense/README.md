# JWT TTL Defense — containing blast radius when an agent is compromised

> **Reference only** — not for production use. Review and adapt for your own security requirements.

End-to-end dramatization of the question every platform team asks about giving AI agents credentials:

> *"What happens when — not if — an agent gets prompt-injected and leaks its token?"*

This example runs three "actors" in one Node process:

1. **The human operator** provisions a vault, stores a real third-party API key (OpenWeather), registers an agent with a **3-second JWT TTL**, and grants the agent a **narrow** read policy on `api/**`.
2. **The victim agent** legitimately exchanges its API key for a JWT, reads its secret, and then gets hijacked by a prompt injection that exfiltrates the JWT to an attacker-controlled channel.
3. **The attacker** receives the leaked JWT and tries three things back-to-back — one fast in-scope read, one fast out-of-scope read, and one slow read past the TTL.

You then see the audit trail and the human rotating the agent key in response.

## Quick start

```bash
cd examples/jwt-ttl-defense
npm install
cp .env.example .env
# Edit .env and set ONECLAW_API_KEY=1ck_...  (a USER key, not an agent key)
npm start                 # containment-only mode (TTL + scope + audit)
npm run start:shroud      # + Shroud LLM proxy: prevention at the LLM boundary
```

Expected output (abbreviated):

```
━━ Act 0 — Provision the agent
✓ Vault created             vault_id=…
✓ Stored real secret        path=api/openweather-key (v1)
✓ Stored out-of-scope decoy path=keys/treasury-signer
✓ Registered agent with 3-second JWT TTL  agent_id=… token_ttl=3s vault_ids=[…]
✓ Policy granted            agent can read "api/**" (and NOTHING else)

━━ Act 1 — Agent does legitimate work and gets compromised
🤖 agent   Exchanging API key for a JWT …
🤖 agent   Received JWT              expires_in=3s, preview=eyJhbGciOiJI…aZK9Qb
🤖 agent   Reading secret "api/openweather-key" (authorized by policy) …
🤖 agent   Secret retrieved — making downstream call
⚠ Prompt injection matched a tool call — agent exfiltrates JWT
☠ attacker Exfil channel received a credential

━━ Act 2 — Attacker tries to pivot with the stolen JWT
☠ attacker Attempt 1 — fast + in-scope (api/openweather-key)
✗ SECRET STOLEN             value=8f3b…57 — this is the blast radius (1 secret, narrow scope)
☠ attacker Attempt 2 — fast + out-of-scope (keys/treasury-signer)
✓ Blocked (403 Forbidden)   scope/vault binding prevented lateral movement
☠ attacker Attempt 3 — slow (4s wait, past 3s TTL)
✓ Blocked (401 Unauthorized) JWT TTL expired

━━ Act 3 — Human response: audit trail + credential rotation
● Querying audit log for recent events by this agent …
   00:12:03.412  auth.agent_token        actor=agent:abcd1234  resource=agent:abcd1234
   00:12:03.611  secret.read             actor=agent:abcd1234  resource=vault:7f2e…
   00:12:04.119  secret.read             actor=agent:abcd1234  resource=vault:7f2e…
   00:12:04.320  secret.read.denied      actor=agent:abcd1234  resource=vault:7f2e…
● Rotating agent API key …
✓ Agent key rotated           new key preview=ocv_abcd…xyz — any stolen API key is now dead

━━ Summary
  ✗ stolen    fast + in-scope         api/openweather-key           reason: in-scope path, JWT still fresh
  ✓ blocked   fast + out-of-scope     keys/treasury-signer          reason: scope/vault binding
  ✓ blocked   slow                    api/openweather-key           reason: TTL expired

  Blast radius: 1 secret leaked, 2 attempts blocked.
  The stolen secret is scoped (single path, single vault) and revocable (rotate + re-policy).
```

## What the demo proves

| Defense in depth                 | How this demo exercises it                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Short-lived agent JWTs**       | Agent is created with `token_ttl_seconds: 3`. The "slow attacker" attempt hits 401 purely because of TTL.   |
| **Scope-bound tokens**           | JWT scope is derived from the single read policy (`api/**`). Out-of-scope fetch returns 403.                |
| **Vault binding (`vault_ids`)**  | Agent is bound to a single vault. Even if an attacker discovers another `vault_id`, the JWT can't use it.   |
| **Audit log**                    | Every legitimate read, denied read, and token exchange ends up on the chained, tamper-evident audit log.    |
| **Rotation**                     | Human response: rotate the agent API key via `client.agents.rotateKey` — any stolen API key is now useless. |
| **Shroud LLM proxy** (`DEMO_SHROUD=1`) | Agent is created with `shroud_enabled: true` + strict `shroud_config`. Shroud's response filter detects the JWT being echoed back by the compromised tool-loop and refuses to forward it. **Blast radius: 0 — the leak never happens.** |

### Modes

- **Containment mode** (`npm start`) — Shroud off. You see the leak happen, then watch TTL + scope + vault binding limit the damage to one secret. This is "what happens when your other defenses did not catch the hijack."
- **Prevention mode** (`npm run start:shroud` or `DEMO_SHROUD=1`) — Shroud on. The simulated LLM response carrying the JWT is run through the same credential regexes and blocked-domain checks Shroud runs in its TEE (see [`shroud/src/inspection/response_filter.rs`](../../shroud/src/inspection/response_filter.rs)). The response is blocked before the tool-loop sees it, the JWT never reaches the exfil channel, and Act 2 does not occur. TTL/scope/vault binding remain as a fallback if Shroud is ever misconfigured or bypassed — classic defense in depth.

## Prerequisites

- Node.js 20+
- A **1Claw user API key** (prefix `1ck_`). Agent keys (`ocv_`) cannot create other agents, which this demo needs. Get one at [1claw.xyz → Settings → API Keys](https://1claw.xyz/settings/api-keys).
- Uses `@1claw/sdk@^0.20.2`.

## How the "prompt injection" is simulated

This demo keeps the focus on **what happens after** a token leaks, so the injection itself is deliberately cartoonish: the "agent" processes a hard-coded user message containing an attacker-controlled HTML comment that triggers a fake `http.get` tool call. A real hijack typically lives inside:

- retrieved documents or emails the agent summarizes,
- user input the agent naively concatenates into prompts,
- tool output the agent trusts,
- or even the system prompt, via multi-turn context manipulation.

The exfiltration path — in-process `EventEmitter` — stands in for a Discord webhook, DNS-rebinding beacon, or attacker-controlled HTTP endpoint the compromised tool-loop can reach.

## Environment variables

| Variable                      | Required | Description                                                                                                    |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `ONECLAW_API_KEY`             | Yes      | A USER key (`1ck_…`). Used to provision the vault, secrets, agent, and policy.                                 |
| `ONECLAW_BASE_URL`            | No       | API URL (default: `https://api.1claw.xyz`).                                                                    |
| `DEMO_OPENWEATHER_KEY`        | No       | Real OpenWeather key. If set, the victim agent makes a real call to [openweathermap.org](https://openweathermap.org/api) after retrieving the secret. |
| `DEMO_WEATHER_CITY`           | No       | City for the weather call (default: `Malibu,US`).                                                              |
| `ATTACKER_SLOW_DELAY_SECONDS` | No       | Seconds the "slow attacker" waits before trying its leaked JWT (default: `4`, i.e. just past the 3-second TTL). |
| `DEMO_SHROUD`                 | No       | Set to `1` / `true` to enable Shroud on the agent and run the LLM response through the local Shroud emulator. |

## Tuning the demo

- **Watch the race condition**: Set `ATTACKER_SLOW_DELAY_SECONDS=2` — the slow attacker now also succeeds. This is the argument for making TTLs as small as your network latency permits.
- **Crank TTL down further**: Edit `SHORT_JWT_TTL_SECONDS` in `src/setup.ts` to 1 and see how many attempts fail.
- **Widen the scope**: Change the policy pattern in `src/setup.ts` from `api/**` to `**` — attempt 2 now also steals the treasury signer. Instant worst-case scenario for your audit.

## File map

- `src/index.ts` — Orchestrator. Runs the three acts + audit + rotation. Reads `DEMO_SHROUD`.
- `src/setup.ts` — Provisions vault, real secret, decoy secret, 3-second-TTL agent, narrow policy. Optionally enables Shroud on the agent.
- `src/victim.ts` — Legitimate agent flow + simulated prompt injection leak. Runs the Shroud response-inspection path when enabled.
- `src/attacker.ts` — Hostile process that receives the stolen JWT and tries three reads.
- `src/shroud.ts` — `buildShroudConfig()` + local emulator of `response_filter` and `network_detection` (mirrors `shroud/src/inspection/response_filter.rs`).
- `src/bus.ts` — In-process exfil channel (stand-in for webhook / beacon).
- `src/pretty.ts` — Console formatting helpers.

## Next steps

- [shroud-security](../shroud-security/) — Shroud threat detectors that *prevent* a prompt injection from reaching the agent in the first place.
- [basic / intents-api](../basic/src/intents-api.ts) — Alternative design: never give the agent the raw key, proxy the signing instead.
- [1Claw docs](https://docs.1claw.xyz) — JWT scopes, policies, token revocation, audit log.
