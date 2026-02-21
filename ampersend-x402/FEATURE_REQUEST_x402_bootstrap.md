# Feature Request: First-Class x402 Payment Key Bootstrap (No Free-Tier Dependency)

**Audience:** 1claw.xyz product / engineering  
**Context:** Apps using 1claw + Ampersend x402 want to store the **buyer/session private key** in 1claw and fetch it at runtime, instead of hardcoding or env vars. Today that’s a chicken-and-egg: you need the key to pay for overages, but the key lives in 1claw and fetching it can itself require payment.

---

## Problem

- **x402 payments** require a client-held private key to sign USDC transfers on Base.
- **Best practice** is to store that key in 1claw (e.g. `keys/x402-session-key`) and fetch it at startup.
- **Current workaround** relies on the free tier (or prepaid credits) for the single “bootstrap” request that fetches the key. If an org has no free requests left and no credits, they can’t bootstrap without some other out-of-band key delivery.

So: **we need a supported, quota-independent way to bootstrap the x402 payment key from 1claw.**

---

## Proposed Directions

### Option A: Quota-exempt bootstrap (minimal API change)

- **Idea:** One (or a few) designated “bootstrap” operations that **do not count against org quota**.
- **Shape:** e.g. a single `GET /v1/vaults/{vault_id}/secrets/{path}` (or a dedicated path like `keys/x402-session-key`) that is allowed once per agent/session or N times per day, and is explicitly **quota-exempt**.
- **Docs:** Document that “fetching your x402 payment key from this path does not consume quota so you can always bootstrap.”
- **Pros:** Small change, works with existing Ampersend flow (client still gets the key and signs locally).  
- **Cons:** Key still touches the client; bootstrap endpoint could be abused if not scoped (e.g. to a single path or agent).

---

### Option B: Crypto proxy for x402 (key never leaves 1claw)

- **Idea:** Agent has a key in 1claw with **crypto proxy** enabled. For x402, the client **never** gets the raw key; instead it asks 1claw to sign the payment transaction.
- **Shape:** e.g. `POST /v1/agents/{id}/transactions` (or a dedicated x402 endpoint) where the body describes the x402 payment intent; 1claw signs with the agent’s designated payment key and returns signed tx / payment proof. Client sends that proof in `X-PAYMENT` and retries the original request.
- **Pros:** Key never leaves 1claw; aligns with existing crypto proxy story; no bootstrap key fetch at all.  
- **Cons:** Requires Ampersend (or the client) to support a “remote signer” / custom wallet that calls 1claw instead of signing locally; 1claw must expose an API that matches what x402 payment flows need.

---

### Option C: Reserved bootstrap quota

- **Idea:** Each org (or agent) gets a small **reserved** quota (e.g. 5 requests/month) that can only be used for a narrow set of operations (e.g. reading a single secret path like `keys/x402-session-key`).
- **Shape:** Same as today’s `get_secret`, but these calls consume “bootstrap” quota instead of main quota. When bootstrap quota is exhausted, normal rules apply.
- **Pros:** Doesn’t require new crypto proxy flows; just a quota bucket and policy.  
- **Cons:** Still a finite bucket; key still touches client; slightly more complex to explain.

---

## Recommendation

- **Short term:** **Option A** (quota-exempt bootstrap for a single, well-defined path or endpoint) gives a clear, documented way to bootstrap the x402 key without relying on “hope we’re within free tier.” Scoped to e.g. one path per vault or per agent to limit abuse.
- **Medium term:** **Option B** (crypto proxy for x402) is the best long-term story: no key on the client, consistent with 1claw’s security model. Would need coordination with Ampersend (or a small adapter) so their payment flow can use a “sign via 1claw” wallet.

---

## Summary

- **Ask:** A supported, quota-independent way to obtain the x402 payment key from 1claw (or to perform x402 payments without ever exposing that key).
- **Preferred quick win:** Quota-exempt bootstrap for a single designated secret path (e.g. `keys/x402-session-key`).
- **Preferred long-term:** Crypto proxy support for x402 so the key never leaves 1claw.

If useful, we can add a short “Suggested API” section for Option A or B (exact paths and request/response shapes).
