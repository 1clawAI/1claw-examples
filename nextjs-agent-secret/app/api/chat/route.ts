import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { oneclawTools } from "@/lib/tools";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a helpful assistant with access to a secure 1Claw vault.
You can list vaults, list secret keys, and fetch secrets when needed.
When a user asks you to use a secret (like an API key), fetch it from the vault first.
IMPORTANT: Never reveal raw secret values in your responses. Say you've retrieved
and are using the secret, but don't show the actual value.`,
    messages,
    tools: oneclawTools,
  });

  return result.toDataStreamResponse();
}
