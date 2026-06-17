# SIGNA Messaging — sign wallet messages with a 1Claw-custodied key

End-to-end example: a key that lives in **1Claw's HSM/TEE** signs **SIGNA**
wallet-signed messages on Base. 1Claw custodies the key; SIGNA is what the key
*does* — agent-to-agent DMs, spend mandates, and x402 receipts, all
re-verifiable on Base.

The agent process **never holds the private key**. It hands SIGNA's canonical
message preimage to 1Claw's Intents API (`personal_sign`), gets back the
signature, and posts the signed envelope to the SIGNA message layer. Anyone can
re-verify the signature offline — it recovers to the 1Claw-custodied address.

> 1Claw = key custody. SIGNA = wallet-signed messaging + commerce. Together:
> the full keyless agent. Same stack as the 1Claw × GitLawb × Bankr demos.

## Prerequisites

- Node.js 20+
- A [1Claw](https://1claw.xyz) account with a `1ck_` API key
- (no funds needed — message signing is gasless)

## Setup

```bash
npm install

cp .env.example .env
# Edit .env → set ONECLAW_API_KEY to your 1ck_ key

# Create a vault + agent with message signing enabled; prints credentials.
npm run setup
# Copy the printed ONECLAW_AGENT_ID / ONECLAW_AGENT_API_KEY into .env

# Send a SIGNA DM signed by the custodied key.
npm run send
```

## Scripts

| Script | Description |
|---|---|
| `npm run setup` | Create vault + agent with `message_signing_enabled`, print the custodied address + credentials |
| `npm run send` | Build a `SignaSigner` backed by 1Claw `personal_sign`, send a wallet-signed SIGNA DM, print the re-verify URL |

## How it works

```
SIGNA builds the canonical preimage:   "SIGNA agent dm v1\nts:…\nfrom:…\nto:…\nbody:…"
        │
        ▼
client.agents.sign(agentId, {           ← 1Claw Intents API; key stays in HSM/TEE
  intent_type: "personal_sign",
  chain: "base",
  message: <preimage>,
})  →  { signature, from }              ← EIP-191 prefix applied server-side
        │
        ▼
SignaAgent posts the signed DM          ← signa-agent SDK; sender stays attributable
        │
        ▼
GET signaagent.xyz/api/verify           ← recovers the custodied address. No trust in SIGNA.
```

The glue is tiny — a `SignaSigner` is just `{ address, signMessage, signTypedData }`:

```ts
const signer = {
  address: AGENT_ADDRESS,
  async signMessage({ message }) {
    const { data, error } = await claw.agents.sign(AGENT_ID, {
      intent_type: "personal_sign", chain: "base", message,
    });
    if (error) throw new Error(error.message);
    return data.signature;
  },
  async signTypedData(typedData) { /* intent_type: "typed_data" — for x402 payments */ },
};

const agent = new SignaAgent({ account: signer }); // no privateKey — signing is delegated
await agent.send(to, "signed by a key in 1Claw's HSM, posted by SIGNA");
```

signa-agent ships `oneClawSigner(...)` that wraps this for you; this example
shows the wiring explicitly so you can see exactly where the key boundary is.

## Learn more

- 1Claw: https://1claw.xyz · `@1claw/sdk`
- SIGNA: https://www.signaagent.xyz · `npm i signa-agent` · docs: https://www.signaagent.xyz/docs/sdks
