/**
 * Shared client setup.
 *
 * Works around a real SDK behavior: createClient() fires the 1ck_-key-to-JWT
 * exchange asynchronously in its constructor without awaiting it
 * (packages/sdk/src/core/client.ts, autoAuthenticateUserKey) — a request
 * made immediately after construction can race that exchange and fail with
 * "No credential was sent". Exchanging the key ourselves first and passing
 * `token` instead of `apiKey` sidesteps the race entirely.
 */
import { createClient } from "@1claw/sdk";

const baseUrl = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const apiKey = process.env.ONECLAW_API_KEY!;

async function resolveToken(): Promise<string> {
  if (!apiKey.startsWith("1ck_")) return apiKey; // agent (ocv_) keys don't need this.
  const res = await fetch(`${baseUrl}/v1/auth/api-key-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Failed to exchange ONECLAW_API_KEY for a token (${res.status})`);
  }
  return body.access_token;
}

export async function getClient() {
  const token = await resolveToken();
  return createClient({ token, baseUrl });
}
