/**
 * Logos Chat agent — one of two agents (Alice or Bob) that exchange
 * ECDH-encrypted, Ed25519-signed messages over the Logos/Waku network.
 *
 * When configured with 1Claw agent credentials (ONECLAW_AGENT_ID + ONECLAW_API_KEY),
 * uses platform-generated P-256 ECDH and Ed25519 keys from the __agent-keys vault.
 * Otherwise generates ephemeral in-memory keys.
 *
 * Communication with the parent process (start-demo.ts) is via IPC:
 *   Parent → Agent:  { cmd: "handshake" | "send", text?: string }
 *   Agent → Parent:  { event: "connected" | "peer_keys" | "received" | "error", ... }
 */

import { createClient } from "@1claw/sdk";
import {
    generateAgentKeys,
    agentKeysFromStored,
    deriveSharedSecret,
    encrypt,
    decrypt,
    sign,
    verify,
    exportEcdhPublicBase64,
    exportSignPublicBase64,
    importEcdhPublic,
    type AgentKeys,
    type SignKeyType,
} from "./crypto.js";
import {
    createChatNode,
    waitForPeers,
    publishMessage,
    subscribeToMessages,
    type LightNode,
} from "./waku-helpers.js";
import {
    encodeMessage,
    decodeMessage,
    type HandshakePayload,
    type ChatPayload,
} from "./message.js";

const AGENT_NAME = process.env.AGENT_NAME ?? "Alice";
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";

function ipc(msg: Record<string, unknown>): void {
    if (process.send) {
        process.send(msg);
    } else {
        console.log(`[${AGENT_NAME}] IPC:`, JSON.stringify(msg));
    }
}

// ── Load keys ──────────────────────────────────────────────────────

async function loadKeys(): Promise<AgentKeys> {
    if (!AGENT_ID || !API_KEY) {
        console.log(`[${AGENT_NAME}] No 1Claw agent config; using in-memory keys.`);
        return generateAgentKeys();
    }

    const sdk = createClient({ baseUrl: BASE_URL, apiKey: API_KEY, agentId: AGENT_ID });

    const selfRes = await sdk.agents.getSelf();
    if (selfRes.error || !selfRes.data) {
        throw new Error(`GET /v1/agents/me failed: ${selfRes.error?.message}`);
    }
    const { ssh_public_key: sshPubB64 } = selfRes.data as { ssh_public_key?: string };
    if (!sshPubB64) throw new Error("Agent has no ssh_public_key on record.");

    const vaultsRes = await sdk.vault.list();
    if (vaultsRes.error) throw new Error(`Failed to list vaults: ${vaultsRes.error.message}`);
    const agentKeysVault = vaultsRes.data?.vaults?.find((v: any) => v.name === "__agent-keys");
    if (!agentKeysVault) throw new Error("__agent-keys vault not found.");

    const sshPrivRes = await sdk.secrets.get(agentKeysVault.id, `agents/${AGENT_ID}/ssh/private_key`);
    const ecdhPrivRes = await sdk.secrets.get(agentKeysVault.id, `agents/${AGENT_ID}/ecdh/private_key`);
    if (sshPrivRes.error || !sshPrivRes.data?.value) {
        throw new Error(`Failed to load SSH key: ${sshPrivRes.error?.message}`);
    }
    if (ecdhPrivRes.error || !ecdhPrivRes.data?.value) {
        throw new Error(`Failed to load ECDH key: ${ecdhPrivRes.error?.message}`);
    }

    console.log(`[${AGENT_NAME}] Loaded platform keys (Ed25519 + P-256 ECDH) from 1Claw`);
    return agentKeysFromStored(ecdhPrivRes.data.value, sshPrivRes.data.value, sshPubB64);
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const keys = await loadKeys();
    const ecdhPublicB64 = exportEcdhPublicBase64(keys.ecdhPublic);
    const { value: signPublicB64, signKeyType } = exportSignPublicBase64(keys);

    console.log(`[${AGENT_NAME}] Connecting to Logos network...`);
    let node: LightNode;
    try {
        node = await createChatNode();
        await waitForPeers(node, 20_000);
        console.log(`[${AGENT_NAME}] Connected to Logos peers`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[${AGENT_NAME}] ${msg}`);
        ipc({ event: "error", error: msg });
        process.exit(1);
    }

    ipc({ event: "connected" });

    // Peer state: store other agent's public keys when we receive their handshake
    let peerEcdhPublicB64: string | null = null;
    let peerSignPublicB64: string | null = null;
    let peerSignKeyType: SignKeyType | null = null;
    let peerName: string | null = null;

    // Subscribe to incoming messages
    await subscribeToMessages(node, (payload: Uint8Array) => {
        try {
            const msg = decodeMessage(payload);

            // Ignore our own messages
            if (msg.sender === AGENT_NAME) return;

            if (msg.type === "handshake") {
                const hs = msg as HandshakePayload;
                peerEcdhPublicB64 = hs.senderEcdhPublic;
                peerSignPublicB64 = hs.senderSignPublic;
                peerSignKeyType = hs.signKeyType as SignKeyType;
                peerName = hs.sender;
                console.log(`[${AGENT_NAME}] Received handshake from ${peerName}`);
                ipc({ event: "peer_keys", peer: peerName });
            }

            if (msg.type === "chat") {
                const chat = msg as ChatPayload;
                if (!peerEcdhPublicB64) {
                    console.log(`[${AGENT_NAME}] Received chat before handshake, ignoring`);
                    return;
                }

                // Verify signature
                const cipherB64 = Buffer.from(chat.ciphertext).toString("base64");
                const sigValid = verify(
                    cipherB64,
                    chat.signature,
                    chat.senderSignPublic,
                    chat.signKeyType as SignKeyType,
                );
                if (!sigValid) {
                    console.log(`[${AGENT_NAME}] Signature verification FAILED from ${chat.sender}`);
                    ipc({ event: "error", error: "signature_failed" });
                    return;
                }

                // Decrypt
                const theirEcdhPublic = importEcdhPublic(chat.senderEcdhPublic);
                const sharedSecret = deriveSharedSecret(keys.ecdhPrivate, theirEcdhPublic);
                const plaintext = decrypt(
                    Buffer.from(chat.ciphertext),
                    Buffer.from(chat.iv),
                    Buffer.from(chat.authTag),
                    sharedSecret,
                );

                console.log(`[${AGENT_NAME}] From ${chat.sender}: "${plaintext}" (verified + decrypted)`);
                ipc({ event: "received", from: chat.sender, plaintext });
            }
        } catch (err) {
            console.error(`[${AGENT_NAME}] Error processing message:`, err);
        }
    });

    // Handle commands from parent process
    process.on("message", async (cmd: any) => {
        try {
            if (cmd.cmd === "handshake") {
                const hs: HandshakePayload = {
                    type: "handshake",
                    timestamp: Date.now(),
                    sender: AGENT_NAME,
                    senderEcdhPublic: ecdhPublicB64,
                    senderSignPublic: signPublicB64,
                    signKeyType,
                };
                await publishMessage(node, encodeMessage(hs));
                console.log(`[${AGENT_NAME}] Published handshake to Logos network`);
            }

            if (cmd.cmd === "send" && cmd.text && peerEcdhPublicB64) {
                const theirEcdhPublic = importEcdhPublic(peerEcdhPublicB64);
                const sharedSecret = deriveSharedSecret(keys.ecdhPrivate, theirEcdhPublic);
                const { ciphertext, iv, authTag } = encrypt(cmd.text, sharedSecret);
                const cipherB64 = ciphertext.toString("base64");
                const signature = sign(cipherB64, keys);

                const chat: ChatPayload = {
                    type: "chat",
                    timestamp: Date.now(),
                    sender: AGENT_NAME,
                    senderEcdhPublic: ecdhPublicB64,
                    senderSignPublic: signPublicB64,
                    signKeyType,
                    ciphertext: new Uint8Array(ciphertext),
                    iv: new Uint8Array(iv),
                    authTag: new Uint8Array(authTag),
                    signature,
                };
                await publishMessage(node, encodeMessage(chat));
                console.log(`[${AGENT_NAME}] Sent encrypted message to ${peerName ?? "peer"}`);
            }
        } catch (err) {
            console.error(`[${AGENT_NAME}] Command error:`, err);
            ipc({ event: "error", error: String(err) });
        }
    });

    // Keep alive
    process.on("SIGTERM", async () => {
        await node.stop();
        process.exit(0);
    });
}

main().catch((err) => {
    console.error(`[${AGENT_NAME}] Fatal:`, err);
    ipc({ event: "error", error: String(err) });
    process.exit(1);
});
