/**
 * ECDH + ECDSA helpers for the A2A signed-message demo.
 * Uses P-256: ECDH for shared secret, ECDSA for signing.
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
    type KeyObject,
} from "crypto";

const CURVE = "prime256v1";
const AES_KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const HKDF_INFO = Buffer.from("a2a-ecdh-demo-v1", "utf8");

export interface AgentKeys {
    /** ECDH key pair (for shared secret derivation) */
    ecdhPrivate: Buffer;
    ecdhPublic: Buffer;
    /** ECDSA key pair (for signing/verifying) */
    signPrivateKey: KeyObject;
    signPublicKey: KeyObject;
}

/**
 * Generate ECDH key pair (createECDH) and ECDSA key pair (createKeyPairSync).
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
 * Sign payload (UTF-8) with ECDSA P-256; returns signature as base64.
 */
export function sign(payload: string, signPrivateKey: KeyObject): string {
    const s = createSign("SHA256");
    s.update(payload, "utf8");
    return s.sign(signPrivateKey).toString("base64");
}

/**
 * Verify ECDSA signature; returns true if valid.
 */
export function verify(
    payload: string,
    signatureBase64: string,
    signPublicKey: KeyObject,
): boolean {
    const v = createVerify("SHA256");
    v.update(payload, "utf8");
    return v.verify(signPublicKey, Buffer.from(signatureBase64, "base64"));
}

/**
 * Export EC public key to base64 (raw uncompressed point for ECDH, or SPKI for ECDSA).
 */
export function exportEcdhPublicBase64(ecdhPublic: Buffer): string {
    return ecdhPublic.toString("base64");
}

export function exportSignPublicBase64(signPublicKey: KeyObject): string {
    return signPublicKey.export({ type: "spki", format: "der" }).toString("base64");
}

export function importEcdhPublicBase64(base64: string): Buffer {
    return Buffer.from(base64, "base64");
}

export function importSignPublicBase64(base64: string): KeyObject {
    return createPublicKey({
        key: Buffer.from(base64, "base64"),
        format: "der",
        type: "spki",
    });
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

/**
 * Build AgentKeys from stored private key material (e.g. from 1Claw).
 * ECDH public key is derived from ECDH private key.
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
        signPrivateKey,
        signPublicKey,
    };
}
