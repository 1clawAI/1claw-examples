/**
 * MPC 2-of-3 multi-HSM (Shamir across GCP + AWS + Azure — no client share on read/write).
 *
 * Tier: Business or Enterprise.
 * Infra: API deployment must register three MPC HSM providers; otherwise vault create returns 400.
 *
 * Flow:
 * 1. Create vault with mpc_custody = "2of3_multi_hsm"
 * 2. PUT a secret — no client_share in response
 * 3. GET the secret — standard GET; server reconstructs from HSM shares
 */

import { apiJson, bearerFromApiKey } from "./lib/api.js";

const API_KEY = process.env.ONECLAW_API_KEY;
const SKIP_CLEANUP = process.env.MPC_SKIP_CLEANUP === "1";

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
    const name = `mpc-2of3-demo-${Date.now()}`;
    const secretPath = "mpc-example-2of3";

    console.log("\n=== MPC 2-of-3 multi-HSM ===\n");

    const create = await apiJson<{ id: string; mpc_custody?: string; mpc_providers?: string[] }>(
        "POST",
        "/v1/vaults",
        token,
        {
            body: {
                name,
                description: "MPC 2of3 example (delete after demo)",
                mpc_custody: "2of3_multi_hsm",
            },
        },
    );

    if (create.status !== 201 || !create.json?.id) {
        console.error("Create vault failed:", create.status, create.text);
        if (create.status === 403) {
            console.error("Hint: 2-of-3 multi-HSM requires Business or Enterprise.");
        }
        if (create.status === 400) {
            console.error(
                "Hint: Server needs three MPC HSM backends (e.g. GCP + AWS + Azure). Local/dev often has only one.",
            );
        }
        process.exit(1);
    }

    const vaultId = create.json.id;
    console.log("Created vault:", vaultId);
    console.log("mpc_custody:", create.json.mpc_custody, "providers:", create.json.mpc_providers);

    const putPath = `/v1/vaults/${vaultId}/secrets/${encodeURIComponent(secretPath)}`;
    const put = await apiJson<{ client_share?: string }>("PUT", putPath, token, {
        body: {
            type: "generic",
            value: "hello-from-2of3-multi-hsm",
        },
    });

    if (put.status !== 200 && put.status !== 201) {
        console.error("PUT secret failed:", put.status, put.text);
        await cleanup(token, vaultId);
        process.exit(1);
    }

    if (put.json?.client_share) {
        console.warn("Unexpected client_share on 2of3_multi_hsm PUT (should be absent)");
    } else {
        console.log("PUT secret OK (no client_share — expected for pure 2-of-3 multi-HSM)\n");
    }

    const get = await apiJson<GetSecretResponse>("GET", putPath, token);

    if (get.status !== 200 || get.json?.value !== "hello-from-2of3-multi-hsm") {
        console.error("GET secret failed or wrong value:", get.status, get.text);
        await cleanup(token, vaultId);
        process.exit(1);
    }

    console.log("GET without X-Client-Share OK — plaintext:", JSON.stringify(get.json?.value));

    await cleanup(token, vaultId);
    console.log("\n=== 2-of-3 demo complete ===\n");
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
