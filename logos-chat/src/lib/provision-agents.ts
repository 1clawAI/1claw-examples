/**
 * Create Alice and Bob demo agents via the user's 1Claw API key, and grant
 * __agent-keys read access. Shared by `npm run bootstrap` and server init.
 */

import { createClient } from "@1claw/sdk";

export interface ProvisionedAgentCreds {
    id: string;
    apiKey: string;
}

export interface ProvisionedPair {
    alice: ProvisionedAgentCreds;
    bob: ProvisionedAgentCreds;
}

export async function provisionAliceAndBob(
    baseUrl: string,
    userApiKey: string,
): Promise<ProvisionedPair> {
    const tokenRes = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/auth/api-key-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: userApiKey }),
    });
    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`API key auth failed (${tokenRes.status}): ${err}`);
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const client = createClient({ baseUrl: baseUrl.replace(/\/$/, ""), token: access_token });

    const aliceRes = await client.agents.create({
        name: "Alice (Logos Chat)",
        description: "Logos Chat demo agent — encrypted messaging with Bob",
        auth_method: "api_key",
        shroud_enabled: true,
    });
    const bobRes = await client.agents.create({
        name: "Bob (Logos Chat)",
        description: "Logos Chat demo agent — encrypted messaging with Alice",
        auth_method: "api_key",
        shroud_enabled: true,
    });

    if (aliceRes.error || bobRes.error) {
        throw new Error(aliceRes.error?.message ?? bobRes.error?.message ?? "Agent creation failed");
    }

    const alice = aliceRes.data!.agent;
    const bob = bobRes.data!.agent;
    const aliceApiKey = aliceRes.data!.api_key;
    const bobApiKey = bobRes.data!.api_key;
    if (!aliceApiKey || !bobApiKey) {
        throw new Error("Agent API keys were not returned by the API");
    }

    // `GET /v1/vaults` intentionally omits __agent-keys; use the org endpoint instead.
    const keysVaultRes = await client.org.getAgentKeysVault();
    if (keysVaultRes.error) {
        throw new Error(
            keysVaultRes.error.message ||
                "Could not resolve __agent-keys vault (it is created when the first agent is registered)",
        );
    }
    const agentKeysVaultId = keysVaultRes.data?.vault_id;
    if (!agentKeysVaultId) {
        throw new Error("agent-keys vault id missing from API response");
    }

    const gAlice = await client.access.grantAgent(
        agentKeysVaultId,
        alice.id,
        ["read"],
        { secretPathPattern: `agents/${alice.id}/**` },
    );
    const gBob = await client.access.grantAgent(
        agentKeysVaultId,
        bob.id,
        ["read"],
        { secretPathPattern: `agents/${bob.id}/**` },
    );
    if (gAlice.error || gBob.error) {
        throw new Error(gAlice.error?.message ?? gBob.error?.message ?? "Policy grant failed");
    }

    return {
        alice: { id: alice.id, apiKey: aliceApiKey },
        bob: { id: bob.id, apiKey: bobApiKey },
    };
}
