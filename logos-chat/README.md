# Logos Chat — Encrypted Agent-to-Agent Chat over Logos

Two 1Claw AI agents (Alice and Bob) use **end-to-end encrypted, signed messages** with the same crypto in the **web UI**; the **CLI demo** sends those messages over the [Logos messaging network](https://docs.waku.org/) (Waku). The UI also includes **AI auto-chat** via 1Claw Shroud.

## Architecture

```
┌────────────────────────────────────────────────────┐
│               Logos / Waku Network                  │
│          (decentralized pub/sub via                 │
│           Light Push + Filter protocol)             │
└──────────┬──────────────────────┬──────────────────┘
           │                      │
     ┌─────┴──────┐        ┌─────┴──────┐
     │   Alice    │        │    Bob     │
     │   Agent    │        │   Agent    │
     ├────────────┤        ├────────────┤
     │ Waku Light │◄──────►│ Waku Light │
     │   Node     │        │   Node     │
     ├────────────┤        ├────────────┤
     │ ECDH +     │        │ ECDH +     │
     │ Ed25519    │        │ Ed25519    │
     │ (from      │        │ (from      │
     │  1Claw)    │        │  1Claw)    │
     └────────────┘        └────────────┘
```

### How it works

1. **Key loading** — Each agent loads its P-256 ECDH and Ed25519 keys from the 1Claw `__agent-keys` vault (or generates ephemeral in-memory keys if no credentials are set).
2. **Network connection** — Each agent creates a Waku light node and discovers peers on the Logos network via default bootstrap.
3. **Handshake** — Agents broadcast their ECDH + signing public keys on a shared Waku content topic.
4. **Encrypted chat** — Messages are encrypted with AES-256-GCM using a shared secret derived via P-256 ECDH key agreement, and signed with Ed25519 (or ECDSA P-256 in fallback mode).
5. **Verification** — The receiver verifies the Ed25519 signature before decrypting.

### Encryption details

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| Key agreement | P-256 ECDH | Derive shared secret between two agents |
| Encryption | AES-256-GCM | Symmetric encryption of message payload |
| Key derivation | SHA-256 + HKDF-style | Derive AES key from ECDH shared secret |
| Signing | Ed25519 (1Claw) / ECDSA P-256 (fallback) | Message authentication |

### Transport details

| Component | Protocol |
|-----------|----------|
| Send | Waku Light Push |
| Receive | Waku Filter (subscription) |
| Discovery | Default bootstrap peers |
| Content topic | `/1claw-logos-chat/1/messages/proto` |
| Message format | Protobuf (`protobufjs`) |

## How we use Logos

**Logos** is decentralized messaging infrastructure. In practice this demo talks to the **public Logos/Waku network** using the official **[Waku JavaScript SDK](https://docs.waku.org/)** (`@waku/sdk`)—the same stack described in Logos and Waku docs as “Logos Delivery” for JS apps.

### What we run

- A **Waku light node** (`createLightNode` in `src/waku-helpers.ts`): lightweight, no full relay. It joins the network using **default bootstrap** peers, then finds peers that speak **Light Push** (publish) and **Filter** (subscribe).
- **Sharding** — We use `clusterId: 1`, `numShardsInCluster: 8`, and `AutoShardingRoutingInfo` from the content topic so messages are routed to the right shard on the live network.

### App channel

- Every message uses one **content topic**: `/1claw-logos-chat/1/messages/proto`. That string is the app-specific “channel”: any client subscribed to this topic can receive the **opaque** payloads we publish.
- **Security** — Plaintext never touches Logos. We encrypt first (ECDH + AES-GCM + signature), then put ciphertext and metadata inside protobuf; Waku only moves bytes.

### Send and receive

- **Send** — `lightPush.send` with an encoder bound to the content topic (`publishMessage`).
- **Receive** — `filter.subscribe` with a matching decoder; each incoming Waku message’s `payload` is handed to the chat logic (`subscribeToMessages`).

### CLI vs web UI

- **`npm run cli`** (`src/agent.ts` + `src/start-demo.ts`) — Alice and Bob run as separate processes with **real Waku/Logos transport**: handshake and chat messages go over the network using the stack above.
- **`npm run dev` (Next.js UI)** — Uses the **same 1Claw keys and crypto** (`src/lib/agents.ts`) so you see real ciphertext, signatures, and decrypted text in the browser. Messages are **not** published over Waku from the Next app today; they stay in the UI session. To observe **end-to-end traffic on Logos**, run the **CLI demo**.

## Quick Start

### Option A: Master API key only (quickest)

Put your personal 1Claw API key in `.env` as `ONECLAW_API_KEY` (leave Alice/Bob empty). On the first request, the app **creates Alice and Bob** in your org, grants `__agent-keys` access, and loads their ECDH + Ed25519 keys — same behavior as bootstrap, without running a script first.

```bash
cd examples/logos-chat
npm install
cp .env.example .env
# Edit .env: set ONECLAW_API_KEY=1ck_...
npm run dev
```

Each **new dev server process** with only the master key may create another agent pair. To persist IDs and keys in `.env`, run **`npm run bootstrap`** once (see Option B).

### Option B: Bootstrap script (writes `.env`)

Creates both agents, grants key access, and writes Alice/Bob into `.env` in one step.

**Interactive (recommended for demos):** run bootstrap with no env var — your **personal API key is read with masked input** (each character shown as `*`):

```bash
cd examples/logos-chat
npm install
npm run bootstrap
# Paste 1ck_... when prompted, then Enter
```

**Non-interactive** (CI or scripts):

```bash
ONECLAW_API_KEY=1ck_... npm run bootstrap

# Optionally include LLM credentials for AI auto-chat
LLM_PROVIDER=google LLM_API_KEY=AIza... ONECLAW_API_KEY=1ck_... npm run bootstrap
```

Then start the UI:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Option C: Without 1Claw (in-memory keys)

```bash
cd examples/logos-chat
npm install
npm run dev
```

Agents generate ephemeral ECDH + ECDSA keys in-memory. Encryption is fully functional — only the 1Claw key persistence and AI auto-chat features are unavailable.

### Option D: CLI demo (Waku network)

The original CLI demo uses real Waku p2p transport:

```bash
npm run cli
```

## Web UI

The UI shows a real-time encrypted chat between Alice and Bob with two key features:

- **Encrypted/Decrypted toggle** — Switch between viewing raw ciphertext (base64 blobs, IVs, signatures) and the decrypted plaintext. Defaults to encrypted view.
- **AI Auto-Chat** — When enabled, agents take turns calling Shroud every ~15 seconds using **that agent’s** credentials (`X-Shroud-Agent-Key` = `agent_id:api_key`). Bootstrap creates agents with **Shroud enabled** so JWTs include Shroud claims. Use **org LLM token billing** by leaving `LLM_API_KEY` unset (Stripe AI Gateway on Shroud). Set `LLM_API_KEY` only for **BYOK** (your provider key; skips Stripe LLM billing on Shroud for that request).

You can also manually type and send messages as either agent using the input fields at the bottom.

### Manual setup (without bootstrap)

1. Create two agents in 1Claw
2. Copy `.env.example` to `.env` and fill in credentials
3. Run `npm run dev`

## Expected output

```
╔══════════════════════════════════════════════════════╗
║  1claw × Logos — Encrypted Agent Chat Demo          ║
║  Two agents chat over the Logos messaging network   ║
║  Messages: ECDH-encrypted + Ed25519/ECDSA-signed   ║
╚══════════════════════════════════════════════════════╝

Starting Alice...
Starting Bob...

Waiting for Logos network peers...
[Alice] Connected to Logos peers
[Bob] Connected to Logos peers
Both agents connected to the Logos network.

── Handshake ──

[Alice] Published handshake to Logos network
[Bob] Published handshake to Logos network
[Alice] Received handshake from Bob
[Bob] Received handshake from Alice
Public keys exchanged over the Logos network.

── Encrypted Chat ──

[Alice] Sent encrypted message to Bob
[Bob] From Alice: "Hello Bob! ..." (verified + decrypted)
[Bob] Sent encrypted message to Alice
[Alice] From Bob: "Hi Alice! ..." (verified + decrypted)

── Summary ──

  Transport:  Logos/Waku decentralized pub/sub (Light Push + Filter)
  Encryption: P-256 ECDH shared secret → AES-256-GCM
  Signing:    Ed25519 (1Claw) or ECDSA P-256 (in-memory)
  Messages exchanged: 2 (verified + decrypted)

Demo complete: two agents chatted with end-to-end encryption over Logos.
```

## Network requirements

The demo connects to the live Logos/Waku network. If peers are not reachable (e.g., in a restricted CI environment), the demo exits gracefully with a skip message.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONECLAW_API_KEY` | Bootstrap only | Your 1Claw API key (for `npm run bootstrap`) |
| `ONECLAW_ALICE_AGENT_ID` | No | Alice's agent ID |
| `ONECLAW_ALICE_API_KEY` | No | Alice's agent API key |
| `ONECLAW_BOB_AGENT_ID` | No | Bob's agent ID |
| `ONECLAW_BOB_API_KEY` | No | Bob's agent API key |
| `LLM_PROVIDER` | No | Shroud provider: `google`, `openai`, `anthropic`, etc. (default: `google`) |
| `LLM_MODEL` | No | Model id sent in the chat request (defaults per provider, e.g. `gemini-2.5-flash` for Google) |
| `LLM_API_KEY` | No | Omit for org **LLM token billing** via Shroud. Set only for **BYOK** (provider key as `X-Shroud-Api-Key`; skips Stripe LLM billing on Shroud) |
| `ONECLAW_BASE_URL` | No | 1Claw API URL (default: `https://api.1claw.xyz`) |
| `SHROUD_URL` | No | Shroud proxy URL (default: `https://shroud.1claw.xyz`) |

## Related

- [google-a2a example](../google-a2a/) — Same ECDH encryption over HTTP-based A2A protocol
- [Logos/Waku JS SDK](https://docs.waku.org/build/javascript/) — Official JavaScript SDK documentation
- [Logos Builder Hub](https://build.logos.co/) — Getting started with Logos
- [1Claw Agent Keys](https://docs.1claw.xyz/) — Platform-managed ECDH and Ed25519 keys
