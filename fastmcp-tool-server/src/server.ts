/**
 * 1Claw + FastMCP — Custom Tool Server
 *
 * A FastMCP server that composes 1Claw SDK operations into higher-level,
 * domain-specific tools. The agent gets business-logic tools like
 * "rotate_api_key" and "get_env_config" alongside the standard vault tools.
 *
 * Run with stdio (default) or HTTP streaming (set MCP_TRANSPORT=httpStream).
 */

import { FastMCP, UserError } from "fastmcp";
import { z } from "zod";
import { createClient, type OneclawClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
let TOKEN = process.env.ONECLAW_AGENT_TOKEN;
const VAULT_ID = process.env.ONECLAW_VAULT_ID;
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const TRANSPORT = process.env.MCP_TRANSPORT ?? "stdio";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

if (!VAULT_ID) {
    console.error("Required: ONECLAW_VAULT_ID");
    process.exit(1);
}

if (!TOKEN && API_KEY && AGENT_ID) {
    const authClient = createClient({ baseUrl: BASE_URL });
    const authRes = await authClient.auth.agentToken({
        api_key: API_KEY,
        agent_id: AGENT_ID,
    });
    if (authRes.error) {
        console.error("Auth failed:", authRes.error.message);
        process.exit(1);
    }
    TOKEN = authRes.data!.access_token;
}

if (!TOKEN) {
    console.error("Required: ONECLAW_AGENT_TOKEN or (ONECLAW_API_KEY + ONECLAW_AGENT_ID)");
    process.exit(1);
}

const sdk = createClient({ baseUrl: BASE_URL, token: TOKEN });

const server = new FastMCP({
    name: "1claw-devops",
    version: "0.1.0",
});

// ── Standard vault tools (pass-through) ─────────────────────────────

server.addTool({
    name: "list_secrets",
    description:
        "List all secrets in the vault. Returns paths, types, versions — never values.",
    parameters: z.object({
        prefix: z.string().optional().describe("Filter by path prefix"),
    }),
    execute: async () => {
        const res = await sdk.secrets.list(VAULT_ID!);
        if (res.error) throw new UserError(res.error.message);
        return JSON.stringify(
            res.data!.secrets.map((s) => ({
                path: s.path,
                type: s.type,
                version: s.version,
            })),
            null,
            2,
        );
    },
});

server.addTool({
    name: "get_secret",
    description: "Fetch the decrypted value of a secret by path.",
    parameters: z.object({
        path: z.string().describe("Secret path"),
    }),
    execute: async ({ path }) => {
        const res = await sdk.secrets.get(VAULT_ID!, path);
        if (res.error) throw new UserError(res.error.message);
        return JSON.stringify({
            path: res.data!.path,
            type: res.data!.type,
            value: res.data!.value,
            version: res.data!.version,
        });
    },
});

server.addTool({
    name: "put_secret",
    description: "Store or update a secret.",
    parameters: z.object({
        path: z.string().describe("Secret path"),
        value: z.string().describe("Secret value"),
        type: z
            .string()
            .default("api_key")
            .describe("Type: api_key, password, private_key, env_bundle, note"),
    }),
    execute: async ({ path, value, type }) => {
        const res = await sdk.secrets.set(VAULT_ID!, path, value, { type });
        if (res.error) throw new UserError(res.error.message);
        return `Stored ${res.data!.path} (v${res.data!.version})`;
    },
});

// ── Domain-specific tools ───────────────────────────────────────────

server.addTool({
    name: "rotate_api_key",
    description:
        "Rotate an API key: fetch the current value, call the provider's " +
        "regenerate endpoint (simulated), then store the new key in 1Claw. " +
        "Returns the new version number.",
    parameters: z.object({
        path: z.string().describe("Secret path of the key to rotate"),
        provider: z
            .string()
            .default("generic")
            .describe("Provider name (for logging)"),
    }),
    execute: async ({ path, provider }, { log }) => {
        const current = await sdk.secrets.get(VAULT_ID!, path);
        if (current.error) throw new UserError(current.error.message);

        log.info(
            `Rotating ${provider} key at ${path} (current v${current.data!.version})`,
        );

        const newValue = `rotated_${Date.now()}_${current.data!.value.slice(-8)}`;

        const updated = await sdk.secrets.set(VAULT_ID!, path, newValue, {
            type: current.data!.type,
            metadata: { rotated_at: new Date().toISOString(), provider },
        });
        if (updated.error) throw new UserError(updated.error.message);

        return `Rotated ${path} from v${current.data!.version} to v${updated.data!.version}`;
    },
});

server.addTool({
    name: "get_env_config",
    description:
        "Fetch an env_bundle secret and parse its KEY=VALUE lines into " +
        "a structured JSON object. Use for loading environment configs.",
    parameters: z.object({
        path: z.string().describe("Path to an env_bundle secret"),
    }),
    execute: async ({ path }) => {
        const res = await sdk.secrets.get(VAULT_ID!, path);
        if (res.error) throw new UserError(res.error.message);
        if (res.data!.type !== "env_bundle") {
            throw new UserError(
                `Secret at '${path}' is type '${res.data!.type}', not 'env_bundle'`,
            );
        }

        const env: Record<string, string> = {};
        for (const line of res.data!.value.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eq = trimmed.indexOf("=");
            if (eq === -1) continue;
            env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
        }
        return JSON.stringify(env, null, 2);
    },
});

server.addTool({
    name: "deploy_service",
    description:
        "Simulate deploying a service: fetch a deploy key from the vault, " +
        "run the deploy (simulated), then store a deploy log as a secret.",
    parameters: z.object({
        service_name: z.string().describe("Name of the service to deploy"),
        key_path: z
            .string()
            .default("deploy-keys/production")
            .describe("Vault path to the deploy key"),
    }),
    execute: async ({ service_name, key_path }, { log }) => {
        log.info(`Deploying ${service_name}...`);

        const keyRes = await sdk.secrets.get(VAULT_ID!, key_path);
        if (keyRes.error)
            throw new UserError(
                `Deploy key not found: ${keyRes.error.message}`,
            );

        log.info("Deploy key retrieved, running deployment...");
        const deployId = `deploy-${Date.now()}`;
        const deployLog = [
            `[${new Date().toISOString()}] Deploy ${deployId} started`,
            `[${new Date().toISOString()}] Service: ${service_name}`,
            `[${new Date().toISOString()}] Key: ${key_path} (v${keyRes.data!.version})`,
            `[${new Date().toISOString()}] Status: SUCCESS`,
        ].join("\n");

        await sdk.secrets.set(VAULT_ID!, `deploy-logs/${deployId}`, deployLog, {
            type: "note",
            metadata: { service: service_name, deploy_id: deployId },
        });

        return `Deployed ${service_name} successfully. Log stored at deploy-logs/${deployId}`;
    },
});

// ── Vault info resource ─────────────────────────────────────────────

server.addResource({
    uri: "vault://info",
    name: "Vault Info",
    description: "Quick summary of the current vault's secrets.",
    mimeType: "application/json",
    async load() {
        const res = await sdk.secrets.list(VAULT_ID!);
        if (res.error)
            return { text: JSON.stringify({ error: res.error.message }) };
        return {
            text: JSON.stringify(
                {
                    vault_id: VAULT_ID,
                    secret_count: res.data!.secrets.length,
                    secrets: res.data!.secrets.map((s) => ({
                        path: s.path,
                        type: s.type,
                        version: s.version,
                    })),
                },
                null,
                2,
            ),
        };
    },
});

// ── Start ───────────────────────────────────────────────────────────

if (TRANSPORT === "httpStream") {
    server.start({
        transportType: "httpStream",
        httpStream: { port: PORT, host: "0.0.0.0" },
    });
    console.log(`1claw-devops MCP server on port ${PORT} (HTTP streaming)`);
} else {
    server.start({ transportType: "stdio" });
}
