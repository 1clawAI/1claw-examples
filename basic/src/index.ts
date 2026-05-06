/**
 * 1Claw SDK — Basic Example
 *
 * Demonstrates the core SDK flows:
 * 1. Authenticate with an API key
 * 2. Create a vault
 * 3. Store a secret
 * 4. Retrieve and read the secret
 * 5. List vault secrets (metadata only)
 * 6. Check billing usage
 * 7. Clean up (also runs in `finally` if a vault was created so runs do not leak KMS cost)
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;

if (!API_KEY) {
    console.error("Set ONECLAW_API_KEY in your environment or .env file");
    process.exit(1);
}

async function main() {
    console.log("Creating client...");
    const client = createClient({ baseUrl: BASE_URL });
    const authRes = AGENT_ID
        ? await client.auth.agentToken({ api_key: API_KEY!, agent_id: AGENT_ID })
        : await client.auth.apiKeyToken({ api_key: API_KEY! });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        return;
    }

    let vault: { id: string; name: string } | null = null;
    let vaultCreated = false;
    let secretWritten = false;
    let cleanupDone = false;

    async function ensureVaultCleanup(c: ReturnType<typeof createClient>) {
        if (cleanupDone || !vault || !vaultCreated) return;
        cleanupDone = true;
        console.log("\n--- Cleaning up (best-effort) ---");
        await c.secrets.delete(vault.id, "OPENAI_KEY").catch(() => {});
        const vaultDelRes = await c.vault.delete(vault.id);
        if (vaultDelRes.error) {
            console.error("Failed to delete vault:", vaultDelRes.error.message);
        } else {
            console.log("Vault deleted.");
        }
    }

    try {
        console.log("\n--- Creating vault ---");
        if (VAULT_ID) {
            const listRes = await client.vault.list();
            const existing = listRes.data?.vaults?.find((v) => v.id === VAULT_ID);
            if (existing) {
                vault = existing;
                console.log(
                    `Using existing vault from ONECLAW_VAULT_ID: ${vault.name} (${vault.id})`,
                );
            } else {
                console.error("ONECLAW_VAULT_ID set but vault not found.");
                return;
            }
        } else {
            const vaultRes = await client.vault.create({
                name: "demo-vault",
                description: "Created by the basic SDK example",
            });
            if (vaultRes.error) {
                if (vaultRes.error.message?.includes("Vault limit")) {
                    const listRes = await client.vault.list();
                    const first = listRes.data?.vaults?.[0];
                    if (first) {
                        vault = first;
                        console.log(
                            `Vault limit reached; using existing: ${vault.name} (${vault.id})`,
                        );
                    } else {
                        console.error("Failed to create vault:", vaultRes.error.message);
                        return;
                    }
                } else {
                    console.error("Failed to create vault:", vaultRes.error.message);
                    return;
                }
            } else {
                vault = vaultRes.data!;
                vaultCreated = true;
                console.log(`Vault created: ${vault.name} (${vault.id})`);
            }
        }

        if (!vault) return;

        console.log("\n--- Storing secret ---");
        const putRes = await client.secrets.set(
            vault.id,
            "OPENAI_KEY",
            "sk-demo-12345",
            {
                type: "api_key",
                metadata: { provider: "openai", environment: "demo" },
            },
        );
        if (putRes.error) {
            console.error("Failed to store secret:", putRes.error.message);
        } else {
            secretWritten = true;
            console.log(
                `Secret stored: ${putRes.data!.path} (v${putRes.data!.version})`,
            );
        }

        console.log("\n--- Retrieving secret ---");
        const getRes = await client.secrets.get(vault.id, "OPENAI_KEY");
        if (getRes.error) {
            console.error("Failed to get secret:", getRes.error.message);
        } else {
            const s = getRes.data!;
            console.log(`Secret: ${s.path}`);
            console.log(`  Type: ${s.type}`);
            console.log(`  Value: ${s.value.slice(0, 8)}...`);
            console.log(`  Version: ${s.version}`);
        }

        console.log("\n--- Listing secrets ---");
        const listRes = await client.secrets.list(vault.id);
        if (listRes.error) {
            console.error("Failed to list secrets:", listRes.error.message);
        } else {
            for (const s of listRes.data!.secrets) {
                console.log(`  ${s.path} (${s.type}, v${s.version})`);
            }
        }

        console.log("\n--- Billing usage ---");
        const usageRes = await client.billing.usage();
        if (usageRes.error) {
            console.error("Failed to get usage:", usageRes.error.message);
        } else {
            const u = usageRes.data!;
            console.log(`  Tier: ${u.billing_tier}`);
            console.log(`  Free limit: ${u.free_tier_limit}/month`);
            console.log(`  Used this month: ${u.current_month.total_requests}`);
        }

        console.log("\n--- Cleaning up ---");
        if (secretWritten) {
            const delRes = await client.secrets.delete(vault.id, "OPENAI_KEY");
            if (!delRes.error) console.log("Secret OPENAI_KEY deleted.");
        }
        if (vaultCreated) {
            const vaultDelRes = await client.vault.delete(vault.id);
            if (vaultDelRes.error) {
                console.error("Failed to delete vault:", vaultDelRes.error.message);
            } else {
                console.log("Vault deleted.");
                cleanupDone = true;
            }
        } else {
            console.log("Left existing vault in place.");
        }

        console.log("\nDone!");
    } finally {
        if (vaultCreated && vault && !cleanupDone) {
            await ensureVaultCleanup(client);
        }
    }
}

main().catch(console.error);
