/**
 * In-process agent state for the Next.js UI.
 *
 * Manages ECDH + signing keys for Alice and Bob, derives the shared secret,
 * and provides encrypt/decrypt helpers. Keys are generated in-memory or loaded
 * from 1Claw via the SDK if credentials are configured.
 */

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
    type AgentKeys,
    type SignKeyType,
} from "@/crypto";
import { provisionAliceAndBob, type ProvisionedPair } from "@/lib/provision-agents";

export type AgentName = "Alice" | "Bob";

export interface EncryptedEnvelope {
    ciphertext: string;
    iv: string;
    authTag: string;
    signature: string;
    senderEcdhPublic: string;
    senderSignPublic: string;
    signKeyType: SignKeyType;
}

export interface ChatEntry {
    id: string;
    from: AgentName;
    timestamp: number;
    encrypted: EncryptedEnvelope;
    decrypted: string;
}

export interface AgentMeta {
    name: AgentName;
    ecdhPublic: string;
    signPublic: string;
    signKeyType: SignKeyType;
}

interface AgentState {
    alice: AgentKeys | null;
    bob: AgentKeys | null;
    sharedSecret: Buffer | null;
    messages: ChatEntry[];
    initialized: boolean;
}

const state: AgentState = {
    alice: null,
    bob: null,
    sharedSecret: null,
    messages: [],
    initialized: false,
};

let msgCounter = 0;

/** In-memory agent credentials when `ONECLAW_API_KEY` provisions Alice/Bob (no per-agent env vars). */
let provisionedPair: ProvisionedPair | null = null;
let initializedWithMasterApiKey = false;

function parseVaultIdsFromJwt(accessToken: string): string[] {
    try {
        const parts = accessToken.split(".");
        if (parts.length !== 3 || !parts[1]) return [];
        const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const payload = JSON.parse(json) as { vault_ids?: string[] };
        return payload.vault_ids ?? [];
    } catch {
        return [];
    }
}

async function loadKeysFromOneclaw(agentId: string, apiKey: string, baseUrl: string): Promise<AgentKeys | null> {
    try {
        const { OneclawClient } = await import("@1claw/sdk");
        const client = new OneclawClient({ baseUrl, apiKey, agentId });
        const authRes = await client.auth.agentToken({ agent_id: agentId, api_key: apiKey });
        if (authRes.error || !authRes.data?.access_token) return null;

        // `GET /v1/vaults` omits __agent-keys. Use `vault_ids` from the token response or JWT payload,
        // then find which vault holds this agent's keys by probing the ECDH path.
        const tokenData = authRes.data as { vault_ids?: string[] };
        const vaultIds = tokenData.vault_ids?.length
            ? tokenData.vault_ids
            : parseVaultIdsFromJwt(authRes.data.access_token);
        if (!vaultIds.length) return null;

        let keysVaultId: string | undefined;
        let ecdhVal: string | undefined;
        for (const vid of vaultIds) {
            const probe = await client.secrets.get(vid, `agents/${agentId}/ecdh/private_key`).catch(() => null);
            const val = probe?.data?.value;
            if (val) {
                keysVaultId = vid;
                ecdhVal = val;
                break;
            }
        }
        if (!keysVaultId || !ecdhVal) return null;

        const [ed25519Priv, ed25519Pub] = await Promise.all([
            client.secrets.get(keysVaultId, `agents/${agentId}/ed25519/private_key`).catch(() => null),
            client.secrets.get(keysVaultId, `agents/${agentId}/ed25519/public_key`).catch(() => null),
        ]);

        const ed25519PrivVal = ed25519Priv?.data?.value;
        const ed25519PubVal = ed25519Pub?.data?.value;
        if (ecdhVal && ed25519PrivVal && ed25519PubVal) {
            return agentKeysFromStored(ecdhVal, ed25519PrivVal, ed25519PubVal);
        }
        return null;
    } catch {
        return null;
    }
}

export interface InitAgentsResult {
    alice: AgentMeta;
    bob: AgentMeta;
    /** True when agents were created via `ONECLAW_API_KEY` (this server process). */
    provisionedWithMasterKey?: boolean;
}

export async function initAgents(): Promise<InitAgentsResult> {
    if (state.initialized && state.alice && state.bob) {
        return {
            ...getAgentMeta(),
            provisionedWithMasterKey: initializedWithMasterApiKey || undefined,
        };
    }

    const baseUrl = process.env.ONECLAW_BASE_URL || "https://api.1claw.co";
    const hasFullAgentEnv = Boolean(
        process.env.ONECLAW_ALICE_AGENT_ID &&
            process.env.ONECLAW_ALICE_API_KEY &&
            process.env.ONECLAW_BOB_AGENT_ID &&
            process.env.ONECLAW_BOB_API_KEY,
    );

    let aliceId = process.env.ONECLAW_ALICE_AGENT_ID;
    let aliceKey = process.env.ONECLAW_ALICE_API_KEY;
    let bobId = process.env.ONECLAW_BOB_AGENT_ID;
    let bobKey = process.env.ONECLAW_BOB_API_KEY;

    if (!hasFullAgentEnv && process.env.ONECLAW_API_KEY) {
        if (!provisionedPair) {
            provisionedPair = await provisionAliceAndBob(baseUrl, process.env.ONECLAW_API_KEY);
            initializedWithMasterApiKey = true;
        }
        aliceId = provisionedPair.alice.id;
        aliceKey = provisionedPair.alice.apiKey;
        bobId = provisionedPair.bob.id;
        bobKey = provisionedPair.bob.apiKey;
        process.env.ONECLAW_ALICE_AGENT_ID = aliceId;
        process.env.ONECLAW_ALICE_API_KEY = aliceKey;
        process.env.ONECLAW_BOB_AGENT_ID = bobId;
        process.env.ONECLAW_BOB_API_KEY = bobKey;
    }

    let aliceKeys: AgentKeys | null = null;
    let bobKeys: AgentKeys | null = null;

    if (aliceId && aliceKey) {
        aliceKeys = await loadKeysFromOneclaw(aliceId, aliceKey, baseUrl);
    }
    if (bobId && bobKey) {
        bobKeys = await loadKeysFromOneclaw(bobId, bobKey, baseUrl);
    }

    state.alice = aliceKeys ?? generateAgentKeys();
    state.bob = bobKeys ?? generateAgentKeys();
    state.sharedSecret = deriveSharedSecret(state.alice.ecdhPrivate, state.bob.ecdhPublic);
    state.initialized = true;

    return {
        ...getAgentMeta(),
        provisionedWithMasterKey: initializedWithMasterApiKey || undefined,
    };
}

export function getAgentMeta(): { alice: AgentMeta; bob: AgentMeta } {
    if (!state.alice || !state.bob) {
        throw new Error("Agents not initialized — call initAgents() first");
    }
    const aliceSign = exportSignPublicBase64(state.alice);
    const bobSign = exportSignPublicBase64(state.bob);
    return {
        alice: {
            name: "Alice",
            ecdhPublic: exportEcdhPublicBase64(state.alice.ecdhPublic),
            signPublic: aliceSign.value,
            signKeyType: aliceSign.signKeyType,
        },
        bob: {
            name: "Bob",
            ecdhPublic: exportEcdhPublicBase64(state.bob.ecdhPublic),
            signPublic: bobSign.value,
            signKeyType: bobSign.signKeyType,
        },
    };
}

export function encryptMessage(from: AgentName, text: string): ChatEntry {
    if (!state.alice || !state.bob || !state.sharedSecret) {
        throw new Error("Agents not initialized");
    }

    const senderKeys = from === "Alice" ? state.alice : state.bob;
    const { ciphertext, iv, authTag } = encrypt(text, state.sharedSecret);

    const sigPayload = Buffer.concat([ciphertext, iv, authTag]).toString("base64");
    const signature = sign(sigPayload, senderKeys);

    const senderEcdh = exportEcdhPublicBase64(senderKeys.ecdhPublic);
    const senderSign = exportSignPublicBase64(senderKeys);

    const entry: ChatEntry = {
        id: `msg-${++msgCounter}-${Date.now()}`,
        from,
        timestamp: Date.now(),
        encrypted: {
            ciphertext: ciphertext.toString("base64"),
            iv: iv.toString("base64"),
            authTag: authTag.toString("base64"),
            signature,
            senderEcdhPublic: senderEcdh,
            senderSignPublic: senderSign.value,
            signKeyType: senderSign.signKeyType,
        },
        decrypted: text,
    };

    state.messages.push(entry);
    return entry;
}

export function decryptAndVerify(entry: ChatEntry): { plaintext: string; verified: boolean } {
    if (!state.sharedSecret) throw new Error("Agents not initialized");

    const { ciphertext, iv, authTag, signature, senderSignPublic, signKeyType } = entry.encrypted;

    const plaintext = decrypt(
        Buffer.from(ciphertext, "base64"),
        Buffer.from(iv, "base64"),
        Buffer.from(authTag, "base64"),
        state.sharedSecret,
    );

    const sigPayload = Buffer.concat([
        Buffer.from(ciphertext, "base64"),
        Buffer.from(iv, "base64"),
        Buffer.from(authTag, "base64"),
    ]).toString("base64");

    const verified = verify(sigPayload, signature, senderSignPublic, signKeyType);

    return { plaintext, verified };
}

export function getMessages(): ChatEntry[] {
    return [...state.messages];
}

export function isInitialized(): boolean {
    return state.initialized;
}
