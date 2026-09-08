# x402 paywall + `1claw pay`

A mock paywall and the two commands that pay it. Nothing here needs a funded
agent, a chain, or a facilitator.

## Two-minute eval

```bash
node paywall.mjs &                       # :4022
ONECLAW_PAY_DEV=1 1claw pay --agent any http://localhost:4022/premium
```

The dev signer produces a header no paywall would honour, which is the point:
it exercises the flow — challenge capture, digest binding, the paid retry, the
result report — without ever being mistakable for a real payment. Expect:

```
  402 │ $0.001 → 0x2B62…8Abc
  signed │ $0.001
  200 │ paid
{"secret":"the answer is 42","paid":true}
```

## Against a real vault

```bash
1claw login
1claw agent create --name paying-agent
# enable pay on the agent, provision an Ethereum signing key, fund it with USDC on Base
1claw pay --agent <id> http://localhost:4022/premium
```

The vault now decides. A first payment prints an authorize link, waits for a
passkey touch, and signs only after it. `--mode session` asks for a spending
grant instead, so payments inside its cap and window need no further prompt —
the vault grants that only if the agent is configured to hold one.

## Watching the refetch loop

```bash
WINDOW_SECS=5 node paywall.mjs
```

A five-second window closes before anyone can authorize. The CLI fetches a fresh
challenge and tries again, twice, then stops and says so. It does **not** re-use
the expired challenge: the same window would come back, and many real challenges
carry a single-use nonce.

## What this does not test

The paywall checks that an `X-PAYMENT` header is present, not that it is valid.
Verifying a signature would need a chain and a facilitator; what is being
exercised here is the flow around the payment, not the settlement of it.
