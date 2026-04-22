import { createClient, type OneclawClient } from "@1claw/sdk";
import { fail, note, ok, step } from "./pretty.js";

export interface DemoResources {
    client: OneclawClient;
    vaultId: string;
    vaultCreated: boolean;
    agentId: string;
    agentApiKey: string;
    policyId: string;
    secretPath: string;
    sensitivePath: string;
    cleanupSecrets: string[];
}

const SHORT_JWT_TTL_SECONDS = 3;

const RESERVED_NAMES = new Set(["__agent-keys"]);

async function findOrCreateVault(
    client: OneclawClient,
): Promise<{ id: string; created: boolean }> {
    const name = "jwt-ttl-defense-demo";
    const createRes = await client.vault.create({
        name,
        description: "Vault used by the jwt-ttl-defense example.",
    });
    if (createRes.data) {
        return { id: createRes.data.id, created: true };
    }

    const limitHit = createRes.error?.message?.includes("Vault limit");
    const dupe =
        createRes.error?.message?.toLowerCase().includes("already exists") ||
        createRes.error?.message?.toLowerCase().includes("conflict");

    if (!limitHit && !dupe) {
        throw new Error(
            `Failed to create demo vault: ${createRes.error?.message ?? "unknown"}`,
        );
    }

    const listRes = await client.vault.list();
    const vaults: Array<{ id: string; name: string }> =
        listRes.data?.vaults ?? [];
    const existing =
        vaults.find((v) => v.name === name) ??
        vaults.find((v) => !RESERVED_NAMES.has(v.name)) ??
        vaults[0];
    if (!existing) {
        throw new Error("No vault available to run the demo in.");
    }
    return { id: existing.id, created: false };
}

export async function setup(
    baseUrl: string,
    apiKey: string,
): Promise<DemoResources> {
    step("Setting up the demo", "vault → real secret → scoped agent → policy");

    const client = createClient({ baseUrl, apiKey });
    // Give the SDK a beat to complete any implicit token exchange.
    await new Promise((r) => setTimeout(r, 500));

    const vault = await findOrCreateVault(client);
    ok(
        vault.created ? "Vault created" : "Reusing existing vault",
        `vault_id=${vault.id}`,
    );

    // 1. Store the "real" secret the agent is allowed to read.
    const secretPath = "api/openweather-key";
    const secretValue =
        process.env.DEMO_OPENWEATHER_KEY?.trim() ||
        // Realistic-looking placeholder (OpenWeatherMap keys are 32 hex chars).
        "8f3b2c5a9d1e7426b0c8ad4f6e9b2d57";

    const putRes = await client.secrets.set(
        vault.id,
        secretPath,
        secretValue,
        {
            type: "api_key",
            metadata: {
                provider: "openweathermap",
                purpose: "weather lookups for support bot",
            },
        },
    );
    if (putRes.error) {
        throw new Error(`Failed to store secret: ${putRes.error.message}`);
    }
    ok("Stored real secret", `path=${secretPath} (v${putRes.data?.version})`);

    // 2. Store an UNRELATED sensitive secret the agent must NOT have access to.
    //    We'll use this to show that a stolen JWT is scope-limited.
    const sensitivePath = "keys/treasury-signer";
    const sensitiveRes = await client.secrets.set(
        vault.id,
        sensitivePath,
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        {
            type: "private_key",
            metadata: { chain: "base", label: "treasury (out of scope)" },
        },
    );
    if (sensitiveRes.error) {
        throw new Error(
            `Failed to store sensitive decoy: ${sensitiveRes.error.message}`,
        );
    }
    ok(
        "Stored out-of-scope decoy",
        `path=${sensitivePath} (only humans may read this)`,
    );

    // 3. Register an agent with a 3-second token TTL and vault binding.
    //    Giving the agent an explicit vault_ids binding ensures a stolen JWT
    //    can only target this vault even if a bug exposed another vault_id.
    const agentRes = await client.agents.create({
        name: "support-bot (demo)",
        description:
            "Demo agent — fetches weather API key to answer user questions.",
        auth_method: "api_key",
        intents_api_enabled: false,
        token_ttl_seconds: SHORT_JWT_TTL_SECONDS,
        vault_ids: [vault.id],
    });
    if (agentRes.error || !agentRes.data) {
        throw new Error(
            `Failed to create agent: ${agentRes.error?.message ?? "unknown"}`,
        );
    }
    const agentId = agentRes.data.agent.id;
    const agentApiKey = agentRes.data.api_key;
    if (!agentApiKey) {
        throw new Error("Agent created but no API key returned.");
    }
    ok(
        "Registered agent with 3-second JWT TTL",
        `agent_id=${agentId}  token_ttl=${SHORT_JWT_TTL_SECONDS}s  vault_ids=[${vault.id}]`,
    );

    // 4. Grant the agent a *narrow* read policy: only `api/**` paths.
    //    The agent's JWT will inherit this pattern as its scope.
    const policyRes = await client.access.grantAgent(
        vault.id,
        agentId,
        ["read"],
        { secretPathPattern: "api/**" },
    );
    if (policyRes.error || !policyRes.data) {
        fail(
            "Policy creation failed",
            policyRes.error?.message ?? "unknown error",
        );
        throw new Error(
            `Policy creation failed: ${policyRes.error?.message ?? "unknown"}`,
        );
    }
    ok(
        "Policy granted",
        `agent can read "${policyRes.data.secret_path_pattern}" (and NOTHING else)`,
    );

    note(
        `Even if an attacker steals this agent's JWT, they can only target "${vault.id}"`,
    );
    note(
        `and only read paths matching "api/**" — and only for ${SHORT_JWT_TTL_SECONDS} seconds.`,
    );

    return {
        client,
        vaultId: vault.id,
        vaultCreated: vault.created,
        agentId,
        agentApiKey,
        policyId: policyRes.data.id,
        secretPath,
        sensitivePath,
        cleanupSecrets: [secretPath, sensitivePath],
    };
}

export async function teardown(res: DemoResources): Promise<void> {
    step("Cleaning up");
    // Best-effort cleanup: log and continue on errors.
    const agentDel = await res.client.agents.delete(res.agentId);
    if (agentDel.error) {
        fail("Failed to delete agent", agentDel.error.message);
    } else {
        ok("Agent deleted");
    }

    for (const path of res.cleanupSecrets) {
        const d = await res.client.secrets.delete(res.vaultId, path);
        if (d.error) {
            fail(`Failed to delete secret ${path}`, d.error.message);
        } else {
            ok(`Secret deleted`, path);
        }
    }

    if (res.vaultCreated) {
        const v = await res.client.vault.delete(res.vaultId);
        if (v.error) {
            fail("Failed to delete vault", v.error.message);
        } else {
            ok("Vault deleted");
        }
    } else {
        note("Left existing vault in place.");
    }
}
