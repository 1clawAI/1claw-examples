import { createClient } from "@1claw/sdk";

/**
 * Singleton 1Claw SDK client used by the server-side API routes.
 * Authenticated via a user API key stored in the environment.
 */
export const oneclaw = createClient({
  baseUrl: process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz",
  apiKey: process.env.ONECLAW_API_KEY!,
});
