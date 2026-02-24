/**
 * ECDH demo coordinator — discovers Alice and Bob, gets their public keys,
 * asks Alice to send an encrypted+signed message to Bob, then asks Bob
 * to decrypt and verify. Shows two agents with different keys exchanging
 * ECDH-encrypted, ECDSA-signed messages over A2A.
 */

import { randomUUID } from "crypto";
import type {
    AgentCard,
    SendTaskRequest,
    SendTaskResponse,
} from "./a2a-types.js";

const ALICE_URL = process.env.ALICE_URL ?? "http://localhost:4100";
const BOB_URL = process.env.BOB_URL ?? "http://localhost:4101";

interface AgentInfo {
    url: string;
    name: string;
    publicKeyEcdh: string;
    publicKeySign: string;
}

async function fetchAgentCard(url: string): Promise<AgentCard & { publicKeyEcdh?: string; publicKeySign?: string }> {
    const res = await fetch(`${url}/.well-known/agent.json`);
    if (!res.ok) throw new Error(`Failed to fetch Agent Card: ${res.status}`);
    return res.json();
}

async function getAgentInfo(url: string): Promise<AgentInfo> {
    const card = await fetchAgentCard(url);
    let publicKeyEcdh = card.publicKeyEcdh;
    let publicKeySign = card.publicKeySign;
    if (!publicKeyEcdh || !publicKeySign) {
        const taskId = randomUUID();
        const rpc: SendTaskRequest = {
            jsonrpc: "2.0",
            id: 1,
            method: "tasks/send",
            params: {
                id: taskId,
                message: {
                    role: "user",
                    parts: [{ type: "text", text: "Get your public key" }],
                },
            },
        };
        const taskRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rpc),
        });
        const taskRpc: SendTaskResponse = await taskRes.json();
        const artifact = taskRpc.result.artifacts?.find((a) => a.name === "public-keys");
        const dataPart = artifact?.parts.find(
            (p): p is { type: "data"; data: Record<string, unknown> } =>
                p.type === "data" && p.data != null,
        );
        const data = dataPart?.data as { publicKeyEcdh?: string; publicKeySign?: string };
        if (data?.publicKeyEcdh) publicKeyEcdh = data.publicKeyEcdh;
        if (data?.publicKeySign) publicKeySign = data.publicKeySign;
    }
    if (!publicKeyEcdh || !publicKeySign) {
        throw new Error(`Could not get public keys for ${url}`);
    }
    return {
        url,
        name: card.name,
        publicKeyEcdh,
        publicKeySign,
    };
}

async function sendRpc(url: string, rpc: SendTaskRequest): Promise<SendTaskResponse> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc),
    });
    return res.json();
}

async function main() {
    console.log("[coordinator] ECDH signed-message demo\n");

    console.log("[coordinator] Discovering Alice...");
    const alice = await getAgentInfo(ALICE_URL);
    console.log(`[coordinator] Alice: ${alice.name}\n`);

    console.log("[coordinator] Discovering Bob...");
    const bob = await getAgentInfo(BOB_URL);
    console.log(`[coordinator] Bob: ${bob.name}\n`);

    const plaintext = "Hello Bob — this message is ECDH-encrypted and ECDSA-signed.";
    console.log(`[coordinator] Asking Alice to send encrypted message to Bob: "${plaintext}"\n`);

    const sendTaskId = randomUUID();
    const sendRpcReq: SendTaskRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/send",
        params: {
            id: sendTaskId,
            message: {
                role: "user",
                parts: [
                    { type: "text", text: "Send encrypted message to Bob" },
                    {
                        type: "data",
                        data: {
                            recipientEcdhPublic: bob.publicKeyEcdh,
                            plaintext,
                        },
                    },
                ],
            },
        },
    };

    const sendRes = await sendRpc(ALICE_URL, sendRpcReq);
    const sendTask = sendRes.result;
    if (sendTask.status.state !== "completed" || !sendTask.artifacts?.length) {
        console.error("[coordinator] Alice failed:", sendTask.status.message?.parts ?? sendTask.status);
        process.exit(1);
    }

    const encryptedArtifact = sendTask.artifacts.find((a) => a.name === "encrypted-message");
    const encryptedDataPart = encryptedArtifact?.parts.find(
        (p): p is { type: "data"; data: Record<string, unknown> } =>
            p.type === "data" && p.data != null,
    );
    const encryptedMessage = encryptedDataPart?.data;
    if (!encryptedMessage) {
        console.error("[coordinator] No encrypted message artifact from Alice");
        process.exit(1);
    }

    console.log("[coordinator] Asking Bob to receive and decrypt the message...\n");

    const receiveTaskId = randomUUID();
    const receiveRpcReq: SendTaskRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tasks/send",
        params: {
            id: receiveTaskId,
            message: {
                role: "user",
                parts: [
                    { type: "text", text: "Receive and decrypt message from Alice" },
                    {
                        type: "data",
                        data: { encryptedMessage },
                    },
                ],
            },
        },
    };

    const receiveRes = await sendRpc(BOB_URL, receiveRpcReq);
    const receiveTask = receiveRes.result;
    if (receiveTask.status.state !== "completed" || !receiveTask.artifacts?.length) {
        console.error("[coordinator] Bob failed:", receiveTask.status.message?.parts ?? receiveTask.status);
        process.exit(1);
    }

    const resultArtifact = receiveTask.artifacts.find((a) => a.name === "receive-result");
    const resultDataPart = resultArtifact?.parts.find(
        (p): p is { type: "data"; data: Record<string, unknown> } =>
            p.type === "data" && p.data != null,
    );
    const result = resultDataPart?.data as { plaintext?: string; error?: string };
    if (result?.error) {
        console.error("[coordinator] Bob reported:", result.error);
        process.exit(1);
    }
    if (result?.plaintext) {
        console.log("[coordinator] Bob decrypted and verified:");
        console.log(`  "${result.plaintext}"`);
        console.log("\n[coordinator] Demo complete: two agents exchanged ECDH-encrypted, ECDSA-signed messages over A2A.");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
