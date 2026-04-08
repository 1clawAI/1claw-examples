/**
 * MPC 2-of-2 client custody (XOR split: server HSM share + client share).
 *
 * Tier: Pro, Team, Business, or Enterprise.
 *
 * Flow:
 * 1. Create a vault with mpc_custody = "2of2_client_custody"
 * 2. PUT a secret — response includes client_share (base64). Store it securely; the server never keeps it.
 * 3. GET the secret — send X-Client-Share with the same base64 value to reconstruct the DEK.
 */

import { apiJson, bearerFromApiKey } from "./lib/api.js";

const API_KEY = process.env.ONECLAW_API_KEY;
const SKIP_CLEANUP = process.env.MPC_SKIP_CLEANUP === "1";

interface PutSecretResponse {
    id?: string;
    path?: string;
    client_share?: string;
    version?: number;
}

interface GetSecretResponse {
    value?: string;
    path?: string;
}

async function main() {
    if (!API_KEY) {
        console.error("Set ONECLAW_API_KEY (human 1ck_ key) in .env");
        process.exit(1);
    }

    const token = await bearerFromApiKey(API_KEY);
    const name = `mpc-2of2-demo-${Date.now()}`;
    const secretPath = "mpc-example-2of2";

    console.log("\n=== MPC 2-of-2 client custody ===\n");

    const create = await apiJson<{ id: string; mpc_custody?: string }>(
        "POST",
        "/v1/vaults",
        token,
        {
            body: {
                name,
                description: "MPC 2of2 example (delete after demo)",
                mpc_custody: "2of2_client_custody",
            },
        },
    );

    if (create.status !== 201 || !create.json?.id) {
        console.error("Create vault failed:", create.status, create.text);
        if (create.status === 403) {
            console.error("Hint: 2-of-2 requires Pro+ billing tier.");
        }
        process.exit(1);
    }

    const vaultId = create.json.id;
    console.log("Created vault:", vaultId, "mpc_custody:", create.json.mpc_custody);

    const putPath = `/v1/vaults/${vaultId}/secrets/${encodeURIComponent(secretPath)}`;
    const put = await apiJson<PutSecretResponse>("PUT", putPath, token, {
        body: {
            type: "generic",
            value: "hello-from-2of2-mpc",
        },
    });

    if (put.status !== 200 && put.status !== 201) {
        console.error("PUT secret failed:", put.status, put.text);
        await cleanup(token, vaultId);
        process.exit(1);
    }

    const clientShare = put.json?.client_share;
    if (!clientShare) {
        console.error("Expected client_share in PUT response for 2-of-2 vault");
        await cleanup(token, vaultId);
        process.exit(1);
    }

    console.log("Stored secret; received client_share (base64, first 24 chars):", clientShare.slice(0, 24) + "…");
    console.log("→ Persist this share offline; without it you cannot decrypt secrets in this vault.\n");

    const get = await apiJson<GetSecretResponse>("GET", putPath, token, {
        headers: { "X-Client-Share": clientShare },
    });

    if (get.status !== 200 || get.json?.value !== "hello-from-2of2-mpc") {
        console.error("GET secret failed or wrong value:", get.status, get.text);
        await cleanup(token, vaultId);
        process.exit(1);
    }

    console.log("GET with X-Client-Share OK — plaintext:", JSON.stringify(get.json?.value));

    const getNoShare = await apiJson<unknown>("GET", putPath, token);
    if (getNoShare.status === 200) {
        console.warn("Warning: GET without X-Client-Share returned 200 (unexpected for 2-of-2)");
    } else {
        console.log("GET without X-Client-Share correctly rejected:", getNoShare.status);
    }

    await cleanup(token, vaultId);
    console.log("\n=== 2-of-2 demo complete ===\n");
}

async function cleanup(token: string, vaultId: string) {
    if (SKIP_CLEANUP) {
        console.log("(MPC_SKIP_CLEANUP=1) leaving vault", vaultId);
        return;
    }
    const del = await apiJson<unknown>("DELETE", `/v1/vaults/${vaultId}`, token);
    console.log("Deleted vault → HTTP", del.status);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
