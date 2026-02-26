/**
 * ECDH demo worker — one of two agents (Alice or Bob) that exchange
 * ECDH-encrypted, signed messages via A2A.
 *
 * When configured with a 1Claw agent (ONECLAW_AGENT_ID + ONECLAW_API_KEY):
 * uses the agent's platform-generated keys — P-256 ECDH and Ed25519 signing —
 * loaded from the __agent-keys vault. No manual key generation needed.
 *
 * Otherwise: generates in-memory ECDH + ECDSA keys for a quick local demo.
 *
 * Set AGENT_NAME (e.g. "Alice", "Bob") and PORT (e.g. 4100, 4101).
 */

import express from "express";
import { createClient } from "@1claw/sdk";
import type {
    AgentCard,
    SendTaskRequest,
    SendTaskResponse,
    Task,
    Artifact,
    Part,
} from "./a2a-types.js";
import {
    generateAgentKeys,
    agentKeysFromStoredEcdhAndEd25519,
    deriveSharedSecret,
    encrypt,
    decrypt,
    sign,
    verify,
    exportEcdhPublicBase64,
    exportSignPublicBase64FromKeys,
    importEcdhPublicBase64,
    type AgentKeys,
    type SignKeyType,
} from "./ecdh-crypto.js";

const AGENT_NAME = process.env.AGENT_NAME ?? "Alice";
const PORT = parseInt(process.env.PORT ?? "4100", 10);
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

const AGENT_KEYS_VAULT_NAME = "__agent-keys";

async function loadKeys(): Promise<AgentKeys> {
    if (!AGENT_ID || !API_KEY) {
        console.log(`[${AGENT_NAME}] No 1Claw agent config; using in-memory keys.`);
        return generateAgentKeys();
    }

    const sdk = createClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        agentId: AGENT_ID,
    });

    // Get agent profile (public keys)
    const selfRes = await sdk.agents.getSelf();
    if (selfRes.error || !selfRes.data) {
        throw new Error(`GET /v1/agents/me failed: ${selfRes.error?.message}`);
    }
    const { ssh_public_key: sshPubB64, ecdh_public_key: _ecdhPubB64 } = selfRes.data as {
        ssh_public_key?: string;
        ecdh_public_key?: string;
    };
    if (!sshPubB64) throw new Error("Agent has no ssh_public_key on record.");

    // Find the __agent-keys vault
    const vaultsRes = await sdk.vault.list();
    if (vaultsRes.error) throw new Error(`Failed to list vaults: ${vaultsRes.error.message}`);
    const agentKeysVault = vaultsRes.data?.vaults?.find((v) => v.name === AGENT_KEYS_VAULT_NAME);
    if (!agentKeysVault) throw new Error("__agent-keys vault not found. Agent may not have access.");

    // Load private keys from __agent-keys vault
    const sshPrivRes = await sdk.secrets.get(agentKeysVault.id, `agents/${AGENT_ID}/ssh/private_key`);
    const ecdhPrivRes = await sdk.secrets.get(agentKeysVault.id, `agents/${AGENT_ID}/ecdh/private_key`);
    if (sshPrivRes.error || !sshPrivRes.data?.value) {
        throw new Error(`Failed to load SSH private key: ${sshPrivRes.error?.message}. Grant agent read on __agent-keys.`);
    }
    if (ecdhPrivRes.error || !ecdhPrivRes.data?.value) {
        throw new Error(`Failed to load ECDH private key: ${ecdhPrivRes.error?.message}. Agent may pre-date ECDH support.`);
    }

    console.log(`[${AGENT_NAME}] Loaded platform keys (Ed25519 + P-256 ECDH) from __agent-keys`);
    return agentKeysFromStoredEcdhAndEd25519(
        ecdhPrivRes.data.value,
        sshPrivRes.data.value,
        sshPubB64,
    );
}

const keys: AgentKeys = await loadKeys();
const ecdhPublicB64 = exportEcdhPublicBase64(keys.ecdhPublic);
const { value: signPublicB64, signKeyType } = exportSignPublicBase64FromKeys(keys);

const app = express();
app.use(express.json());

// Agent Card includes public keys and sign key type so coordinator can verify correctly
const agentCard: AgentCard & {
    publicKeyEcdh?: string;
    publicKeySign?: string;
    signKeyType?: SignKeyType;
} = {
    name: `${AGENT_NAME} (ECDH demo)`,
    description: `Agent that can exchange ECDH-encrypted, ECDSA-signed messages with another agent.`,
    url: `http://localhost:${PORT}`,
    version: "0.1.0",
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    skills: [
        {
            id: "get-public-key",
            name: "Get public key",
            description: "Return this agent's ECDH and ECDSA public keys (base64).",
            tags: ["ecdh", "identity"],
        },
        {
            id: "send-message",
            name: "Send encrypted message",
            description:
                "Encrypt and sign a message for another agent. Requires recipient's ECDH public key and plaintext.",
            tags: ["ecdh", "encryption", "signing"],
        },
        {
            id: "receive-message",
            name: "Receive encrypted message",
            description:
                "Decrypt and verify a message from another agent. Requires the sender's artifact (ciphertext, iv, authTag, keys, signature).",
            tags: ["ecdh", "decryption", "verification"],
        },
    ],
    publicKeyEcdh: ecdhPublicB64,
    publicKeySign: signPublicB64,
    signKeyType,
};

app.get("/.well-known/agent.json", (_req, res) => {
    res.json(agentCard);
});

function getDataPart(parts: Part[]): Record<string, unknown> | null {
    const dataPart = parts.find(
        (p): p is { type: "data"; data: Record<string, unknown> } =>
            p.type === "data" && p.data != null,
    );
    return dataPart?.data ?? null;
}

app.post("/", (req, res) => {
    const rpc = req.body as SendTaskRequest;

    if (rpc.method !== "tasks/send") {
        res.status(400).json({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32601, message: `Unknown method: ${rpc.method}` },
        });
        return;
    }

    const { id, message } = rpc.params;
    const userText = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
    const data = getDataPart(message.parts);

    console.log(`[${AGENT_NAME}] Task ${id}: "${userText.slice(0, 60)}..."`);

    const task: Task = {
        id,
        sessionId: rpc.params.sessionId ?? id,
        status: { state: "working", timestamp: new Date().toISOString() },
        messages: [message],
    };

    const artifacts: Artifact[] = [];

    try {
        // get public key
        if (/get|public|key|identity/i.test(userText) && !/send|receive/.test(userText)) {
            artifacts.push({
                name: "public-keys",
                description: `${AGENT_NAME} ECDH and signing public keys`,
                parts: [
                    {
                        type: "data",
                        data: {
                            agent: AGENT_NAME,
                            publicKeyEcdh: ecdhPublicB64,
                            publicKeySign: signPublicB64,
                            signKeyType,
                        },
                    },
                ],
            });
        }

        // send message: encrypt + sign for recipient
        if (/send|encrypt/i.test(userText) && data?.recipientEcdhPublic != null) {
            const recipientEcdhPublicB64 = data.recipientEcdhPublic as string;
            const plaintext = (data.plaintext as string) || userText.replace(/send.*?:\s*/i, "").trim() || "Hello";
            const theirEcdhPublic = importEcdhPublicBase64(recipientEcdhPublicB64);
            const sharedSecret = deriveSharedSecret(keys.ecdhPrivate, theirEcdhPublic);
            const { ciphertext, iv, authTag } = encrypt(plaintext, sharedSecret);
            const payload = Buffer.concat([ciphertext, iv, authTag]).toString("base64");
            const signature = sign(payload, keys);
            artifacts.push({
                name: "encrypted-message",
                description: `Encrypted and signed message from ${AGENT_NAME}`,
                parts: [
                    {
                        type: "data",
                        data: {
                            ciphertext: ciphertext.toString("base64"),
                            iv: iv.toString("base64"),
                            authTag: authTag.toString("base64"),
                            senderEcdhPublic: ecdhPublicB64,
                            senderSignPublic: signPublicB64,
                            senderSignKeyType: signKeyType,
                            signature,
                        },
                    },
                ],
            });
        }

        // receive message: verify + decrypt
        if (/receive|decrypt|verify/i.test(userText) && data?.encryptedMessage != null) {
            const msg = data.encryptedMessage as {
                ciphertext: string;
                iv: string;
                authTag: string;
                senderEcdhPublic: string;
                senderSignPublic: string;
                senderSignKeyType?: SignKeyType;
                signature: string;
            };
            const ciphertext = Buffer.from(msg.ciphertext, "base64");
            const iv = Buffer.from(msg.iv, "base64");
            const authTag = Buffer.from(msg.authTag, "base64");
            const senderEcdhPublic = importEcdhPublicBase64(msg.senderEcdhPublic);
            const payload = Buffer.concat([ciphertext, iv, authTag]).toString("base64");
            const senderSignKeyType: SignKeyType = msg.senderSignKeyType ?? "ecdsa";
            if (!verify(payload, msg.signature, keys, msg.senderSignPublic, senderSignKeyType)) {
                artifacts.push({
                    name: "receive-result",
                    parts: [{ type: "data", data: { error: "Signature verification failed" } }],
                });
            } else {
                const sharedSecret = deriveSharedSecret(keys.ecdhPrivate, senderEcdhPublic);
                const plaintext = decrypt(ciphertext, iv, authTag, sharedSecret);
                artifacts.push({
                    name: "receive-result",
                    description: "Decrypted and verified plaintext",
                    parts: [{ type: "data", data: { plaintext } }],
                });
            }
        }

        if (artifacts.length === 0) {
            task.status = {
                state: "failed",
                message: {
                    role: "agent",
                    parts: [
                        {
                            type: "text",
                            text: "Unrecognized task. Use: get public key, send message (with data: recipientEcdhPublic, plaintext), or receive message (with data: encryptedMessage).",
                        },
                    ],
                },
                timestamp: new Date().toISOString(),
            };
        } else {
            task.status = {
                state: "completed",
                message: {
                    role: "agent",
                    parts: [
                        {
                            type: "text",
                            text: `Task completed with ${artifacts.length} artifact(s).`,
                        },
                    ],
                },
                timestamp: new Date().toISOString(),
            };
            task.artifacts = artifacts;
        }
    } catch (err) {
        task.status = {
            state: "failed",
            message: {
                role: "agent",
                parts: [
                    {
                        type: "text",
                        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
                    },
                ],
            },
            timestamp: new Date().toISOString(),
        };
    }

    const response: SendTaskResponse = {
        jsonrpc: "2.0",
        id: rpc.id,
        result: task,
    };
    res.json(response);
});

app.listen(PORT, () => {
    console.log(`[${AGENT_NAME}] ECDH demo agent listening on port ${PORT}`);
    console.log(`[${AGENT_NAME}] Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
});
