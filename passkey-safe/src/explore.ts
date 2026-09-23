/**
 * Passkey Safes — 1Claw's non-custodial signing model where a Gnosis Safe's
 * ONLY owner is the user's own WebAuthn passkey (SafeWebAuthnSharedSigner).
 * No private key for the Safe exists anywhere, ever — not in a browser, not
 * on 1Claw's servers. Verified against the real implementation:
 *   vault/src/api/handlers/passkey_safes.rs
 *   vault/migrations/263_passkey_safes.sql
 *
 * This example is HONEST about what can and can't run headless: creating a
 * Safe requires a passkey that already exists, and registering a passkey is
 * a real WebAuthn ceremony — the browser cryptographically binds the
 * credential to the exact origin performing the registration
 * (`https://1claw.co`), which a Node.js script cannot fake or spoof its way
 * around. This script demonstrates every part of the flow that genuinely
 * doesn't need that ceremony, and prints the real, verified shapes for the
 * parts that do, sourced directly from the vault handler, not guessed.
 *
 * Usage: cp .env.example .env, fill in ONECLAW_API_KEY (a human 1ck_ key —
 * Passkey Safes are owned by a *user*, never an agent), then:
 *   npm install && npm start
 */

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!API_KEY) {
  console.error("Set ONECLAW_API_KEY (a human 1ck_ key) in .env — see .env.example");
  process.exit(1);
}
if (!API_KEY.startsWith("1ck_")) {
  console.error(
    "Passkey Safes are owned by a human user, not an agent — ONECLAW_API_KEY must be a 1ck_ key, not ocv_.",
  );
  process.exit(1);
}

/**
 * A direct token exchange, not the @1claw/sdk client — the passkey-safes API
 * (create/list/prepare/execute/grants) has no SDK wrapper today; only the
 * agent-spend side does (client.agents.spendFromPasskeySafe, demoed below).
 * Verified: packages/sdk/src/resources/treasury.ts wraps multisig treasury
 * wallets, a different feature; nothing in packages/sdk/src/resources/
 * touches /v1/treasury/passkey-safes.
 */
async function getUserToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/auth/api-key-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: API_KEY }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function api(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  const token = await getUserToken();
  console.log("Authenticated as a human user.\n");

  // ---- 1. Real, live: list existing passkeys and Safes ----
  const passkeys = await api(token, "/v1/auth/passkeys");
  console.log("GET /v1/auth/passkeys →", JSON.stringify(passkeys.body, null, 2));

  const safes = await api(token, "/v1/treasury/passkey-safes");
  console.log("GET /v1/treasury/passkey-safes →", JSON.stringify(safes.body, null, 2));

  const existingPasskey = passkeys.body?.passkeys?.[0];

  if (!existingPasskey) {
    console.log(`
No passkeys registered on this account yet — that's the real, honest state
this example hits for a fresh user, and it's as far as a headless script can
take you. Registering one is a genuine WebAuthn ceremony (dashboard →
Settings → Security → "Add passkey") where the BROWSER, not 1Claw's API,
cryptographically binds the resulting credential to the exact origin that
requested it (https://1claw.co). There is no API call that creates a passkey
without that browser ceremony — that is the entire point of it being
non-custodial: nothing 1Claw's servers can do produces a usable credential.

Once you've registered a passkey via the dashboard, re-run this script — it
will pick up from here and actually create a Safe with it.
`);
  } else {
    console.log(`\nUsing existing passkey: ${existingPasskey.id} ("${existingPasskey.name ?? "unnamed"}")\n`);

    // ---- 2. Real, live: create a Safe owned by that passkey ----
    const chain = "base-sepolia";
    const created = await api(token, "/v1/treasury/passkey-safes", {
      method: "POST",
      body: JSON.stringify({ chain, passkey_id: existingPasskey.id }),
    });
    console.log(`POST /v1/treasury/passkey-safes (chain=${chain}) →`, JSON.stringify(created.body, null, 2));

    if (created.ok) {
      const safeId = created.body.id;
      console.log(`
Safe address: ${created.body.safe_address}
This address is counterfactual — CREATE2-derived, not yet deployed on-chain.
It becomes real the moment the first transaction relays through it. No
private key exists for it anywhere: the Safe's sole owner is Safe's shared
WebAuthn signer module, configured with your passkey's P-256 public key.
`);

      // ---- 3. Real, live: prepare a transaction (does NOT need the assertion yet) ----
      const prepared = await api(token, `/v1/treasury/passkey-safes/${safeId}/prepare`, {
        method: "POST",
        body: JSON.stringify({ to: "0x000000000000000000000000000000000000dEaD", value_wei: "0" }),
      });
      console.log("POST .../prepare →", JSON.stringify(prepared.body, null, 2));
      console.log(`
"safe_tx_hash" above IS the WebAuthn challenge — the browser's
navigator.credentials.get({ challenge: safe_tx_hash, ... }) call signs
exactly that hash with your passkey. That signature, wrapped in Safe's
contract-signature format, is what /execute relays as execTransaction.
This script stops here: producing a real assertion requires the same
real-origin browser ceremony as registration.
`);
    }
  }

  // ---- 4. Agent-spend: the part that IS fully scriptable, once a grant exists ----
  // A human one-time-authorizes an allowance (via the Safe's on-chain Allowance
  // Module, enabled by the same passkey-signed /execute flow above); after
  // that, the agent spends against it with its own ECDSA key — no further
  // passkey touch per transaction. This is the one piece @1claw/sdk actually
  // wraps: client.agents.spendFromPasskeySafe().
  console.log(`
--- Agent-spend (the fully-scriptable half) ---
Once a human has run create_grant + the one-time passkey /execute to enable
it on-chain, an agent can spend against that allowance with zero further
passkey involvement — its own server-custody Ethereum key is the delegate
signature the Safe's Allowance Module checks. That's:

  const { createClient } = await import("@1claw/sdk");
  const client = createClient({ apiKey: agentApiKey }); // an ocv_ agent key
  const result = await client.agents.spendFromPasskeySafe(agentId, safeId, {
    to: "0x...", amount: "1000000000000000", token: undefined, // native
  });
`);
  if (AGENT_ID) {
    console.log(
      `ONECLAW_AGENT_ID is set (${AGENT_ID}) but this script only has your human key, not that agent's — run the snippet above with the agent's own ocv_ key to actually try it.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
