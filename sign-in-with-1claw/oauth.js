/**
 * Minimal OAuth 2.0 + PKCE implementation for "Sign in with 1Claw".
 *
 * This file implements the full authorization code flow with PKCE (S256)
 * in ~80 lines of vanilla JavaScript. No dependencies required.
 */

const STORAGE_KEY = "1claw_pkce_verifier";
const STATE_KEY = "1claw_oauth_state";

// --- Crypto helpers ---

function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCE() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const codeVerifier = base64url(buf);

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64url(new Uint8Array(digest));

  return { codeVerifier, codeChallenge };
}

function generateState() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

// --- Sign-in flow ---

/**
 * Start the OAuth sign-in flow.
 * Generates PKCE pair, stores the verifier, and redirects to 1Claw consent page.
 */
async function startSignIn(config) {
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = generateState();

  sessionStorage.setItem(STORAGE_KEY, codeVerifier);
  sessionStorage.setItem(STATE_KEY, state);

  const dashboardUrl = (config.DASHBOARD_URL || "https://1claw.co").replace(/\/$/, "");
  const url = new URL("/oauth/authorize", dashboardUrl);
  url.searchParams.set("client_id", config.CLIENT_ID);
  url.searchParams.set("redirect_uri", config.REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (config.SCOPES || ["openid", "profile", "email"]).join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  window.location.href = url.toString();
}

/**
 * Handle the OAuth callback — exchange the authorization code for tokens.
 * Validates state, retrieves the stored code_verifier, and calls the token endpoint.
 */
async function handleCallback({ code, state, config }) {
  const storedState = sessionStorage.getItem(STATE_KEY);
  if (state && storedState && state !== storedState) {
    throw new Error("OAuth state mismatch — possible CSRF attack.");
  }

  const codeVerifier = sessionStorage.getItem(STORAGE_KEY);
  if (!codeVerifier) {
    throw new Error("Missing PKCE code_verifier. Did the sign-in flow start in this browser tab?");
  }

  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  const baseUrl = (config.BASE_URL || "https://api.1claw.co").replace(/\/$/, "");
  const resp = await fetch(`${baseUrl}/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: config.CLIENT_ID,
      redirect_uri: config.REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `Token exchange failed: ${resp.status}`);
  }

  return resp.json();
}
