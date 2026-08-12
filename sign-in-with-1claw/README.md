# Sign in with 1Claw — OAuth 2.0 + PKCE Example

A minimal, zero-dependency demo of the "Sign in with 1Claw" OAuth flow. Plain HTML + vanilla JavaScript — no build step, no framework, no npm install.

## How it works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Your App   │         │  1Claw Auth  │         │  1Claw API  │
│ (this demo) │         │ (consent UI) │         │   (Vault)   │
└──────┬──────┘         └──────┬───────┘         └──────┬──────┘
       │                       │                        │
       │  1. Generate PKCE     │                        │
       │     code_verifier +   │                        │
       │     code_challenge    │                        │
       │                       │                        │
       │  2. Redirect ─────────►                        │
       │     /oauth/authorize  │                        │
       │     ?client_id=...    │                        │
       │     &code_challenge=  │                        │
       │                       │                        │
       │                       │  3. User logs in       │
       │                       │     and approves       │
       │                       │                        │
       │  4. Redirect back ◄───┤                        │
       │     ?code=AUTH_CODE   │                        │
       │     &state=...        │                        │
       │                       │                        │
       │  5. POST /v1/oauth/token ─────────────────────►│
       │     { code, code_verifier, client_id }         │
       │                                                │
       │  6. Receive tokens ◄───────────────────────────┤
       │     { access_token, id_token }                 │
       │                                                │
       │  7. Decode id_token for user info              │
       │     (sub, email, name, wallet_address)         │
       └────────────────────────────────────────────────┘
```

## Prerequisites

1. **A 1Claw account** with a Pro or higher plan
2. **A registered Platform App** — create one at [1claw.xyz/platform](https://1claw.xyz/platform)
3. Your platform app's **slug** (this is the `client_id` for OAuth — set when you create the app)
4. A **redirect URI** registered in the app's settings (e.g. `http://localhost:8080/callback.html`)

## Setup

1. **Clone or copy this folder**

2. **Edit `config.js`** with your values:

```js
const CONFIG = {
  CLIENT_ID: "your-app-slug",  // the slug you chose when creating the platform app
  REDIRECT_URI: "http://localhost:8080/callback.html",
  BASE_URL: "https://api.1claw.xyz",
  DASHBOARD_URL: "https://1claw.xyz",
  SCOPES: ["openid", "profile", "email"],
};
```

3. **Add the redirect URI** to your platform app's `redirect_uris` list in the dashboard (Platform → your app → Settings).

## Run

Serve the files with any static HTTP server on port 8080:

```bash
# Python (built-in)
python3 -m http.server 8080

# Node.js (npx, no install)
npx serve -l 8080

# Or use the included helper
npm start
```

Then open [http://localhost:8080](http://localhost:8080) and click "Sign in with 1Claw".

## File structure

```
sign-in-with-1claw/
├── index.html      Landing page with sign-in button
├── callback.html   Handles the OAuth redirect, exchanges code for tokens
├── config.js       Your app configuration (client_id, redirect_uri)
├── oauth.js        Reusable OAuth 2.0 + PKCE logic (~80 lines)
├── package.json    Optional — just for `npm start` convenience
└── README.md       This file
```

## OAuth flow step by step

### 1. User clicks "Sign in with 1Claw"

`index.html` calls `startSignIn()` which:
- Generates a random 32-byte **code_verifier** and its SHA-256 **code_challenge**
- Generates a random **state** parameter (CSRF protection)
- Stores `code_verifier` and `state` in `sessionStorage`
- Redirects the browser to `https://1claw.xyz/oauth/authorize?...`

### 2. User authenticates on 1Claw

The 1Claw dashboard shows a consent page with your app name and requested scopes. The user logs in (if needed) and clicks "Approve".

### 3. 1Claw redirects back with an authorization code

After approval, 1Claw redirects to your `REDIRECT_URI` with `?code=AUTH_CODE&state=STATE`.

### 4. Callback page exchanges the code for tokens

`callback.html` calls `handleCallback()` which:
- Validates `state` matches what was stored (CSRF check)
- Retrieves `code_verifier` from `sessionStorage`
- POSTs to `https://api.1claw.xyz/v1/oauth/token` with the code, verifier, and client_id
- Receives `{ access_token, id_token, token_type, expires_in }`

### 5. Display user info

The `id_token` is a standard JWT containing the user's profile:
- `sub` — unique user identifier
- `email` — user's email address
- `name` — display name
- `wallet_address` — their 1Claw treasury wallet address

## Using the React component instead

If you prefer React, install `@1claw/wallet-react` and use the drop-in component:

```tsx
import { SignInWith1Claw, handleSignInCallback } from "@1claw/wallet-react";

// On your login page:
<SignInWith1Claw
  clientId="your-client-id"
  redirectUri="http://localhost:3000/callback"
  scopes={["openid", "profile", "email"]}
  theme="dark"
  size="md"
/>

// On your callback page:
const params = new URLSearchParams(window.location.search);
const tokens = await handleSignInCallback({
  code: params.get("code"),
  state: params.get("state"),
  clientId: "your-client-id",
  redirectUri: "http://localhost:3000/callback",
});
```

## Security notes

- **PKCE (S256)** is mandatory — prevents authorization code interception attacks
- **State parameter** prevents CSRF — always validate it on callback
- The `code_verifier` never leaves the browser (stored in `sessionStorage`, cleared after use)
- `id_token` is signed with RS256 by 1Claw — verify it server-side in production
- Tokens are short-lived — use `refresh_token` (when `offline_access` scope is requested) for long sessions

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Set CLIENT_ID in config.js" | Edit `config.js` with your platform app **slug** |
| "Unknown client_id" | Use the app **slug** (e.g. `my-defi`), not the UUID |
| "OAuth state mismatch" | Sign-in must start and finish in the same browser tab |
| "Missing PKCE code_verifier" | SessionStorage was cleared — restart the flow |
| 400 on token exchange | Ensure `redirect_uri` matches exactly what's registered on the app |
| User sees "Unknown app" | Your platform app may be inactive — check the dashboard |
