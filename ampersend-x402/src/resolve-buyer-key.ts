/**
 * Resolve the buyer private key from one of two sources:
 *
 *   1. BUYER_PRIVATE_KEY env var (direct, traditional)
 *   2. Fetch from a 1Claw vault at BUYER_KEY_PATH (default: "keys/x402-session-key")
 *
 * Option 2 avoids storing the raw key in env vars entirely — the only
 * prerequisite is ONECLAW_API_KEY + ONECLAW_VAULT_ID, which are needed
 * anyway. The single bootstrap fetch counts against the free tier
 * (1,000 req/mo) or prepaid credits — no wallet needed yet.
 */

import { createClient } from "@1claw/sdk";
import type { Hex } from "viem";

interface ResolveOptions {
    apiKey: string;
    vaultId: string;
    baseUrl: string;
    agentId?: string;
}

export async function resolveBuyerKey(opts: ResolveOptions): Promise<Hex> {
    const envKey = process.env.BUYER_PRIVATE_KEY;
    if (envKey) {
        console.log("[bootstrap] Using BUYER_PRIVATE_KEY from environment");
        return envKey as Hex;
    }

    const keyPath =
        process.env.BUYER_KEY_PATH ?? "keys/x402-session-key";

    console.log(
        `[bootstrap] BUYER_PRIVATE_KEY not set — fetching from 1Claw vault at "${keyPath}"`,
    );

    const sdk = createClient({ baseUrl: opts.baseUrl });

    // Explicitly authenticate before fetching (autoAuthenticate is non-blocking)
    if (opts.agentId) {
        await sdk.auth.agentToken({
            api_key: opts.apiKey,
            agent_id: opts.agentId,
        });
    } else {
        await sdk.auth.apiKeyToken({ api_key: opts.apiKey });
    }

    const res = await sdk.secrets.get(opts.vaultId, keyPath);

    if (res.error) {
        console.error(
            `[bootstrap] Failed to fetch buyer key from 1Claw: ${res.error.message}`,
        );
        console.error(
            `[bootstrap] Either set BUYER_PRIVATE_KEY in your .env, or store your ` +
                `session key at "${keyPath}" in vault ${opts.vaultId}`,
        );
        process.exit(1);
    }

    const value = res.data!.value;
    if (!value || !value.startsWith("0x")) {
        console.error(
            `[bootstrap] Secret at "${keyPath}" does not look like a private key (must start with 0x)`,
        );
        process.exit(1);
    }

    console.log(`[bootstrap] Buyer key fetched from 1Claw (path: ${keyPath})`);
    return value as Hex;
}
