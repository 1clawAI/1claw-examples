/**
 * Configuration for the "Sign in with 1Claw" demo.
 *
 * 1. Register a Platform App at https://1claw.co/platform
 * 2. Copy the app's slug (the client_id for OAuth)
 * 3. Add your redirect URI to the app's allowed redirect_uris
 * 4. Update the values below
 */
const CONFIG = {
  // Your Platform App's slug (set when you create the app)
  // This is the client_id for OAuth — NOT the app UUID
  CLIENT_ID: "YOUR_PLATFORM_APP_SLUG",

  // Where 1Claw redirects after the user approves/denies
  // Must match one of the redirect_uris registered on your platform app
  REDIRECT_URI: "http://localhost:8080/callback.html",

  // 1Claw API base URL (default: production)
  BASE_URL: "https://api.1claw.co",

  // 1Claw Dashboard URL (where the consent page lives)
  DASHBOARD_URL: "https://1claw.co",

  // OAuth scopes to request
  SCOPES: ["openid", "profile", "email"],
};
