/**
 * ECDH + signing helpers for the A2A signed-message demo.
 * Uses P-256 ECDH for shared secret. Signing uses either the agent's built-in
 * Ed25519 key (from 1Claw) or generated P-256 ECDSA (in-memory / legacy).
 */

import {
    createECDH,
    createCipheriv,
    createDecipheriv,
    createSign,
    createVerify,
    createHash,
    createPublicKey,
    createPrivateKey,
    generateKeyPairSync,
    randomBytes,
    sign as cryptoSign,
    verify as cryptoVerify,
    type KeyObject,
} from "crypto";

const CURVE = "prime256v1";
const AES_KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const HKDF_INFO = Buffer.from("a2a-ecdh-demo-v1", "utf8");

/** Ed25519 OID 1.3.101.112 */
const ED25519_OID = Buffer.from([0x06, 0x03, 0x2b, 0x65, 0x70]);

/** Build PKCS#8 DER for Ed25519 private key (32-byte raw seed). */
function ed25519RawPrivateToPkcs8(rawSeed: Buffer): Buffer {
    return Buffer.concat([
        Buffer.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05]),
        ED25519_OID,
        Buffer.from([0x04, 0x22, 0x04, 0x20]),
        rawSeed,
    ]);
}

/** Build SPKI DER for Ed25519 public key (32-byte raw). */
function ed25519RawPublicToSpki(rawPublic: Buffer): Buffer {
    return Buffer.concat([
        Buffer.from([0x30, 0x2a, 0x30, 0x05]),
        ED25519_OID,
        Buffer.from([0x03, 0x21, 0x00]),
        rawPublic,
    ]);
}

export type SignKeyType = "ecdsa" | "ed25519";

export interface AgentKeys {
    /** ECDH key pair (for shared secret derivation) */
    ecdhPrivate: Buffer;
    ecdhPublic: Buffer;
    /** Signing: either ECDSA P-256 or Ed25519 (agent's built-in key). */
    signKeyType: SignKeyType;
    /** ECDSA key pair (when signKeyType === "ecdsa") */
    signPrivateKey?: KeyObject;
    signPublicKey?: KeyObject;
    /** Ed25519 raw 32-byte keys (when signKeyType === "ed25519") — stored as KeyObject internally for crypto ops */
    signPrivateKeyEd25519?: KeyObject;
    signPublicKeyEd25519?: KeyObject;
}

/**
 * Generate ECDH key pair and ECDSA key pair (for in-memory / no-1Claw mode).
 */
export function generateAgentKeys(): AgentKeys {
    const ecdh = createECDH(CURVE);
    ecdh.generateKeys();
    const { privateKey: signPrivateKey, publicKey: signPublicKey } =
        generateKeyPairSync("ec", {
            namedCurve: "P-256",
        });
    return {
        ecdhPrivate: ecdh.getPrivateKey(),
        ecdhPublic: ecdh.getPublicKey(),
        signKeyType: "ecdsa",
        signPrivateKey,
        signPublicKey,
    };
}

/**
 * Derive shared secret using ECDH (my private, their public).
 */
export function deriveSharedSecret(
    myEcdhPrivate: Buffer,
    theirEcdhPublic: Buffer,
): Buffer {
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(myEcdhPrivate);
    return ecdh.computeSecret(theirEcdhPublic);
}

/**
 * Derive AES-256 key from ECDH shared secret using HKDF-style expansion.
 */
function deriveAesKey(sharedSecret: Buffer): Buffer {
    const hash = createHash("sha256").update(sharedSecret).update(HKDF_INFO).digest();
    return hash.slice(0, AES_KEY_LEN);
}

/**
 * Encrypt plaintext with AES-256-GCM using key derived from shared secret.
 */
export function encrypt(
    plaintext: string,
    sharedSecret: Buffer,
): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
    const key = deriveAesKey(sharedSecret);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv, {
        authTagLength: AUTH_TAG_LEN,
    });
    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return { ciphertext: encrypted, iv, authTag };
}

/**
 * Decrypt ciphertext (AES-256-GCM) using key derived from shared secret.
 */
export function decrypt(
    ciphertext: Buffer,
    iv: Buffer,
    authTag: Buffer,
    sharedSecret: Buffer,
): string {
    const key = deriveAesKey(sharedSecret);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
        authTagLength: AUTH_TAG_LEN,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]).toString("utf8");
}

/**
 * Sign payload (UTF-8) with ECDSA P-256 or Ed25519; returns signature as base64.
 */
export function sign(payload: string, keys: AgentKeys): string {
    if (keys.signKeyType === "ed25519" && keys.signPrivateKeyEd25519) {
        const sig = cryptoSign(null, Buffer.from(payload, "utf8"), keys.signPrivateKeyEd25519);
        return sig.toString("base64");
    }
    if (keys.signPrivateKey) {
        const s = createSign("SHA256");
        s.update(payload, "utf8");
        return s.sign(keys.signPrivateKey).toString("base64");
    }
    throw new Error("No signing key available");
}

/**
 * Verify signature (ECDSA or Ed25519); returns true if valid.
 */
export function verify(
    payload: string,
    signatureBase64: string,
    keys: AgentKeys,
    senderSignPublicB64: string,
    senderSignKeyType: SignKeyType,
): boolean {
    if (senderSignKeyType === "ed25519") {
        const pubKey = importSignPublicBase64Ed25519(senderSignPublicB64);
        return cryptoVerify(null, Buffer.from(payload, "utf8"), pubKey, Buffer.from(signatureBase64, "base64"));
    }
    const pubKey = importSignPublicBase64(senderSignPublicB64);
    const v = createVerify("SHA256");
    v.update(payload, "utf8");
    return v.verify(pubKey, Buffer.from(signatureBase64, "base64"));
}

/**
 * Export EC public key to base64 (raw uncompressed point for ECDH).
 */
export function exportEcdhPublicBase64(ecdhPublic: Buffer): string {
    return ecdhPublic.toString("base64");
}

/** Export ECDSA (SPKI) or Ed25519 (raw 32-byte) public key as base64. */
export function exportSignPublicBase64FromKeys(keys: AgentKeys): { value: string; signKeyType: SignKeyType } {
    if (keys.signKeyType === "ed25519" && keys.signPublicKeyEd25519) {
        const raw = keys.signPublicKeyEd25519.export({ type: "spki", format: "der" });
        const raw32 = raw.subarray(-32);
        return { value: raw32.toString("base64"), signKeyType: "ed25519" };
    }
    if (keys.signPublicKey) {
        return {
            value: keys.signPublicKey.export({ type: "spki", format: "der" }).toString("base64"),
            signKeyType: "ecdsa",
        };
    }
    throw new Error("No signing public key");
}

export function exportSignPublicBase64(signPublicKey: KeyObject): string {
    return signPublicKey.export({ type: "spki", format: "der" }).toString("base64");
}

export function importEcdhPublicBase64(base64: string): Buffer {
    return Buffer.from(base64, "base64");
}

/** Import ECDSA public key (SPKI base64). */
export function importSignPublicBase64(base64: string): KeyObject {
    return createPublicKey({
        key: Buffer.from(base64, "base64"),
        format: "der",
        type: "spki",
    });
}

/** Import Ed25519 public key (raw 32-byte base64, as stored by 1Claw on agent record). */
export function importSignPublicBase64Ed25519(base64: string): KeyObject {
    const raw = Buffer.from(base64, "base64");
    const spki = ed25519RawPublicToSpki(raw);
    return createPublicKey({ key: spki, format: "der", type: "spki" });
}

/** Export ECDH private key as base64 (raw bytes). */
export function exportEcdhPrivateBase64(ecdhPrivate: Buffer): string {
    return ecdhPrivate.toString("base64");
}

/** Export ECDSA private key as base64 (PKCS#8 DER). */
export function exportSignPrivateKeyToBase64(signPrivateKey: KeyObject): string {
    return signPrivateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
}

/** Import ECDH private key from base64; returns Buffer for setPrivateKey. */
export function importEcdhPrivateFromBase64(base64: string): Buffer {
    return Buffer.from(base64, "base64");
}

/** Import ECDSA private key from base64 (PKCS#8 DER). */
export function importSignPrivateFromBase64(base64: string): KeyObject {
    return createPrivateKey({
        key: Buffer.from(base64, "base64"),
        format: "der",
        type: "pkcs8",
    });
}

/** Import Ed25519 private key from base64 (raw 32-byte seed, as stored in 1Claw __agent-keys). */
export function importSignPrivateKeyEd25519FromBase64(base64: string): KeyObject {
    const raw = Buffer.from(base64, "base64");
    const der = ed25519RawPrivateToPkcs8(raw);
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

/**
 * Build AgentKeys from stored ECDH + ECDSA private keys (legacy: both in vault).
 */
export function agentKeysFromStoredPrivates(
    ecdhPrivateB64: string,
    signPrivateB64: string,
): AgentKeys {
    const ecdhPrivate = importEcdhPrivateFromBase64(ecdhPrivateB64);
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(ecdhPrivate);
    const signPrivateKey = importSignPrivateFromBase64(signPrivateB64);
    const signPublicKey = createPublicKey(signPrivateKey);
    return {
        ecdhPrivate,
        ecdhPublic: ecdh.getPublicKey(),
        signKeyType: "ecdsa",
        signPrivateKey,
        signPublicKey,
    };
}

/**
 * Build AgentKeys from ECDH private key (in vault) + Ed25519 from 1Claw (__agent-keys).
 * Uses the agent's built-in SSH keypair for signing; only ECDH is stored in the demo vault.
 */
export function agentKeysFromStoredEcdhAndEd25519(
    ecdhPrivateB64: string,
    ed25519PrivateKeyB64: string,
    ed25519PublicKeyB64: string,
): AgentKeys {
    const ecdhPrivate = importEcdhPrivateFromBase64(ecdhPrivateB64);
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(ecdhPrivate);
    const signPrivateKeyEd25519 = importSignPrivateKeyEd25519FromBase64(ed25519PrivateKeyB64);
    const signPublicKeyEd25519 = importSignPublicBase64Ed25519(ed25519PublicKeyB64);
    return {
        ecdhPrivate,
        ecdhPublic: ecdh.getPublicKey(),
        signKeyType: "ed25519",
        signPrivateKeyEd25519,
        signPublicKeyEd25519,
    };
}
