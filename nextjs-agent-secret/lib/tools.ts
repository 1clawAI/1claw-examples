import { tool } from "ai";
import { z } from "zod";
import { oneclaw } from "./oneclaw";

/**
 * Server-side secret storage — holds decrypted secrets by request ID
 * so they can be used within the same request lifecycle without ever
 * being exposed to the client or the model's response stream.
 */
const secretCache = new Map<string, string>();

export function getCachedSecret(key: string): string | undefined {
  return secretCache.get(key);
}

/**
 * AI SDK tool definitions that wrap 1Claw SDK methods.
 * These are passed to `streamText()` so the model can invoke them.
 */
export const oneclawTools = {
  getSecret: tool({
    description:
      "Fetch a secret from the 1Claw vault. " +
      "Returns a status indicator — never the raw secret value. " +
      "May require human approval if the secret is gated.",
    parameters: z.object({
      vaultId: z.string().describe("UUID of the vault"),
      key: z.string().describe("Secret key/path within the vault"),
      reason: z.string().describe("Why the agent needs this secret"),
    }),
    execute: async ({ vaultId, key, reason }) => {
      const res = await oneclaw.secrets.get(vaultId, key, { reason });

      if (res.error) {
        if (res.error.type === "approval_required") {
          return {
            status: "pending_approval" as const,
            message: "A human must approve access to this secret.",
          };
        }
        if (res.error.type === "payment_required") {
          return {
            status: "payment_required" as const,
            message: "Free tier exhausted. x402 payment is required.",
          };
        }
        return {
          status: "error" as const,
          message: res.error.message,
        };
      }

      secretCache.set(`${vaultId}:${key}`, res.data!.value);

      return {
        status: "available" as const,
        hint: `Secret "${key}" retrieved successfully. It is available server-side for use.`,
      };
    },
  }),

  listVaults: tool({
    description: "List all vaults accessible to the current identity.",
    parameters: z.object({}),
    execute: async () => {
      const res = await oneclaw.vault.list();
      if (res.error) return { status: "error" as const, message: res.error.message };

      return {
        status: "ok" as const,
        vaults: res.data!.vaults.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description,
        })),
      };
    },
  }),

  listSecretKeys: tool({
    description:
      "List all secret keys in a vault without revealing values. " +
      "Returns metadata only: path, type, version.",
    parameters: z.object({
      vaultId: z.string().describe("UUID of the vault"),
    }),
    execute: async ({ vaultId }) => {
      const res = await oneclaw.secrets.list(vaultId);
      if (res.error) return { status: "error" as const, message: res.error.message };

      return {
        status: "ok" as const,
        keys: res.data!.secrets.map((s) => ({
          path: s.path,
          type: s.type,
          version: s.version,
        })),
      };
    },
  }),
};
