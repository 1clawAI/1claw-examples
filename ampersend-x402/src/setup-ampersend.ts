/**
 * Idempotent setup for the ampersend-x402 example using a human API key.
 *
 * Interactive (terminal): prompts for user API key and x402 session private key.
 * Non-interactive (CI): uses env vars only.
 *
 * Env (non-interactive or as fallback when a prompt is left empty):
 *   ONECLAW_FULL_API_KEY — user API key (1ck_...)
 *   Or ONECLAW_API_KEY if it is not an agent key (ocv_...)
 *   X402_SESSION_KEY — 0x... session key; if unset, a new key is generated
 *
 * Optional:
 *   ONECLAW_BASE_URL (default https://api.1claw.xyz)
 *   BUYER_KEY_PATH (default keys/x402-session-key)
 *   SETUP_VAULT_NAME (default ampersend-x402-demo)
 *   SETUP_AGENT_NAME (default ampersend-x402-agent)
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@1claw/sdk";
import { generatePrivateKey } from "viem/accounts";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

const BUYER_KEY_PATH =
    process.env.BUYER_KEY_PATH?.trim() || "keys/x402-session-key";
const VAULT_NAME = process.env.SETUP_VAULT_NAME?.trim() || "ampersend-x402-demo";
const AGENT_NAME = process.env.SETUP_AGENT_NAME?.trim() || "ampersend-x402-agent";

function die(msg: string): never {
    console.error(msg);
    process.exit(1);
}

function userKeyFromEnv(): string | undefined {
    const fullKey = process.env.ONECLAW_FULL_API_KEY?.trim();
    const genericKey = process.env.ONECLAW_API_KEY?.trim();
    return (
        fullKey ||
        (genericKey && !genericKey.startsWith("ocv_") ? genericKey : undefined)
    );
}

function hasKeysReadPolicy(
    grants: {
        principal_type: string;
        principal_id: string;
        secret_path_pattern: string;
        permissions: string[];
    }[],
    agentId: string,
): boolean {
    return grants.some(
        (p) =>
            p.principal_type === "agent" &&
            p.principal_id === agentId &&
            p.permissions.includes("read") &&
            (p.secret_path_pattern === "keys/**" ||
                p.secret_path_pattern === BUYER_KEY_PATH ||
                p.secret_path_pattern === "**"),
    );
}

/** MCP demo uses put/delete at test/ampersend-demo */
function hasTestDemoPolicy(
    grants: {
        principal_type: string;
        principal_id: string;
        secret_path_pattern: string;
        permissions: string[];
    }[],
    agentId: string,
): boolean {
    return grants.some(
        (p) =>
            p.principal_type === "agent" &&
            p.principal_id === agentId &&
            p.permissions.includes("write") &&
            p.permissions.includes("delete") &&
            (p.secret_path_pattern === "test/**" || p.secret_path_pattern === "**"),
    );
}

async function promptInteractive(): Promise<{ userKey: string; sessionKey: string }> {
    const rl = readline.createInterface({ input, output });
    try {
        console.log(
            "\n── Ampersend x402 setup ──────────────────────────────────────",
        );
        console.log(
            "Paste your credentials below (input is echoed in the terminal).\n",
        );

        const userLine = (
            await rl.question(
                "1. User API key (1ck_... from 1claw.xyz → Settings → API Keys)\n   (leave empty to use ONECLAW_FULL_API_KEY / ONECLAW_API_KEY from env):\n   ",
            )
        ).trim();

        let userKey = userLine || userKeyFromEnv() || "";
        if (!userKey) {
            die(
                "No user API key: paste a 1ck_ key above or set ONECLAW_FULL_API_KEY in the environment.",
            );
        }
        if (userKey.startsWith("ocv_")) {
            die(
                "That looks like an agent key (ocv_). Use your user API key (1ck_...) from Settings → API Keys.",
            );
        }

        const pkLine = (
            await rl.question(
                "\n2. x402 session private key (0x...)\n   (leave empty to generate a new key and store it in the vault):\n   ",
            )
        ).trim();

        let sessionKey: string;
        if (pkLine) {
            sessionKey = pkLine;
        } else {
            sessionKey = generatePrivateKey();
            console.log("\n   (Generated new session key.)\n");
        }

        if (!sessionKey.startsWith("0x")) {
            die("Session private key must start with 0x.");
        }

        return { userKey, sessionKey };
    } finally {
        rl.close();
    }
}

async function main() {
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

    let userKey: string;
    let sessionKey: string;

    if (interactive) {
        ({ userKey, sessionKey } = await promptInteractive());
    } else {
        userKey = userKeyFromEnv() ?? "";
        if (!userKey) {
            if (process.env.ONECLAW_API_KEY?.trim()?.startsWith("ocv_")) {
                die(
                    "Non-interactive setup: set ONECLAW_FULL_API_KEY to your user key (1ck_). " +
                        "ONECLAW_API_KEY is an agent key.",
                );
            }
            die(
                "Non-interactive setup: set ONECLAW_FULL_API_KEY (or a non-ocv ONECLAW_API_KEY).",
            );
        }
        if (userKey.startsWith("ocv_")) {
            die("Setup requires a user API key (1ck_...), not an agent key (ocv_...).");
        }
        sessionKey =
            process.env.X402_SESSION_KEY?.trim() || generatePrivateKey();
        if (!sessionKey.startsWith("0x")) {
            die("X402_SESSION_KEY must start with 0x.");
        }
    }

    const client = createClient({ baseUrl: BASE_URL, apiKey: userKey });
    const auth = await client.auth.apiKeyToken({ api_key: userKey });
    if (auth.error || !auth.data?.access_token) {
        die(
            `API key exchange failed: ${auth.error?.message ?? "no token"}. ` +
                "Check the key and ONECLAW_BASE_URL.",
        );
    }

    const vaultsRes = await client.vault.list();
    if (vaultsRes.error) {
        die(`List vaults failed: ${vaultsRes.error.message}`);
    }
    let vaultId = vaultsRes.data?.vaults.find((v) => v.name === VAULT_NAME)?.id;
    if (!vaultId) {
        const created = await client.vault.create({
            name: VAULT_NAME,
            description: "Vault for examples/ampersend-x402 (x402 session key + policies)",
        });
        if (created.error || !created.data) {
            die(`Create vault failed: ${created.error?.message ?? "unknown"}`);
        }
        vaultId = created.data.id;
        console.log(`Created vault "${VAULT_NAME}" (${vaultId})`);
    } else {
        console.log(`Using existing vault "${VAULT_NAME}" (${vaultId})`);
    }

    const agentsRes = await client.agents.list();
    if (agentsRes.error) {
        die(`List agents failed: ${agentsRes.error.message}`);
    }
    let agentId = agentsRes.data?.agents.find((a) => a.name === AGENT_NAME)?.id;
    let agentApiKey: string | undefined;

    if (!agentId) {
        const created = await client.agents.create({
            name: AGENT_NAME,
            description: "Agent for examples/ampersend-x402 (MCP + x402 bootstrap)",
            scopes: [],
            vault_ids: [vaultId],
        });
        if (created.error || !created.data?.agent) {
            die(`Create agent failed: ${created.error?.message ?? "unknown"}`);
        }
        agentId = created.data.agent.id;
        agentApiKey = created.data.api_key;
        console.log(`Created agent "${AGENT_NAME}" (${agentId})`);
        if (!agentApiKey) {
            console.warn(
                "No api_key in response; set ONECLAW_AGENT_API_KEY manually or rotate the agent key.",
            );
        }
    } else {
        console.log(`Using existing agent "${AGENT_NAME}" (${agentId})`);
        console.warn(
            "API key is not shown again. Use your saved ocv_ key or: 1claw agent rotate-key <id>",
        );
    }

    const grantsRes = await client.access.listGrants(vaultId);
    if (grantsRes.error) {
        die(`List policies failed: ${grantsRes.error.message}`);
    }
    const grants = grantsRes.data?.policies ?? [];
    if (!hasKeysReadPolicy(grants, agentId)) {
        const grant = await client.access.grantAgent(vaultId, agentId, ["read"], {
            secretPathPattern: "keys/**",
        });
        if (grant.error) {
            die(`Grant agent read on keys/** failed: ${grant.error.message}`);
        }
        console.log(`Created policy: agent ${agentId} → keys/** (read)`);
    } else {
        console.log("Policy already grants this agent read on keys (or **). Skipping grant.");
    }

    const grantsRes2 = await client.access.listGrants(vaultId);
    const grants2 = grantsRes2.data?.policies ?? grants;
    if (!hasTestDemoPolicy(grants2, agentId)) {
        const grant = await client.access.grantAgent(
            vaultId,
            agentId,
            ["read", "write", "delete"],
            { secretPathPattern: "test/**" },
        );
        if (grant.error) {
            die(`Grant agent on test/** failed: ${grant.error.message}`);
        }
        console.log(`Created policy: agent ${agentId} → test/** (read, write, delete)`);
    } else {
        console.log("Policy already grants this agent test/** (or **). Skipping MCP demo grant.");
    }

    const existingSecret = await client.secrets.get(vaultId, BUYER_KEY_PATH);
    if (existingSecret.data?.value) {
        console.log(
            `Secret already exists at "${BUYER_KEY_PATH}" (version ${existingSecret.data.version ?? "?"}). Not overwriting.`,
        );
    } else {
        if (existingSecret.error) {
            const st = existingSecret.meta?.status;
            if (st !== 404) {
                die(
                    `Could not read "${BUYER_KEY_PATH}": ${existingSecret.error.message} (${st})`,
                );
            }
        }
        const put = await client.secrets.set(vaultId, BUYER_KEY_PATH, sessionKey, {
            type: "private_key",
        });
        if (put.error) {
            die(`Store session key failed: ${put.error.message}`);
        }
        console.log(`Stored x402 session key at "${BUYER_KEY_PATH}" (private_key)`);
    }

    console.log("\n--- Add this to examples/ampersend-x402/.env ---\n");
    console.log(`ONECLAW_BASE_URL=${BASE_URL}`);
    console.log(`ONECLAW_BASE_URL=${BASE_URL}`);
    console.log(`ONECLAW_VAULT_ID=${vaultId}`);
    console.log(`ONECLAW_AGENT_ID=${agentId}`);
    if (agentApiKey) {
        console.log(`ONECLAW_API_KEY=${agentApiKey}`);
    } else {
        console.log("# ONECLAW_API_KEY=ocv_...  (your saved agent key for this agent)");
    }
    console.log(`# BUYER_PRIVATE_KEY unset → load key from vault path:`);
    console.log(`# BUYER_KEY_PATH=${BUYER_KEY_PATH}`);
    console.log("# SMART_ACCOUNT_ADDRESS=0x...  (required — from Ampersend)");
    console.log("\n---\n");
    console.log("Then run: npm start");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
