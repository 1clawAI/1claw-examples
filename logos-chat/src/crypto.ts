/**
 * ECDH + signing helpers for encrypted Logos chat.
 * Adapted from examples/google-a2a/src/ecdh-crypto.ts.
 *
 * P-256 ECDH for shared secret derivation, AES-256-GCM for message encryption,
 * Ed25519 (from 1Claw) or ECDSA P-256 (in-memory fallback) for signing.
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
const HKDF_INFO = Buffer.from("logos-chat-v1", "utf8");

const ED25519_OID = Buffer.from([0x06, 0x03, 0x2b, 0x65, 0x70]);

function ed25519RawPrivateToPkcs8(rawSeed: Buffer): Buffer {
    return Buffer.concat([
        Buffer.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05]),
        ED25519_OID,
        Buffer.from([0x04, 0x22, 0x04, 0x20]),
        rawSeed,
    ]);
}

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
    ecdhPrivate: Buffer;
    ecdhPublic: Buffer;
    signKeyType: SignKeyType;
    signPrivateKey?: KeyObject;
    signPublicKey?: KeyObject;
    signPrivateKeyEd25519?: KeyObject;
    signPublicKeyEd25519?: KeyObject;
}

export function generateAgentKeys(): AgentKeys {
    const ecdh = createECDH(CURVE);
    ecdh.generateKeys();
    const { privateKey: signPrivateKey, publicKey: signPublicKey } =
        generateKeyPairSync("ec", { namedCurve: "P-256" });
    return {
        ecdhPrivate: ecdh.getPrivateKey(),
        ecdhPublic: ecdh.getPublicKey(),
        signKeyType: "ecdsa",
        signPrivateKey,
        signPublicKey,
    };
}

export function deriveSharedSecret(
    myEcdhPrivate: Buffer,
    theirEcdhPublic: Buffer,
): Buffer {
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(myEcdhPrivate);
    return ecdh.computeSecret(theirEcdhPublic);
}

function deriveAesKey(sharedSecret: Buffer): Buffer {
    return createHash("sha256").update(sharedSecret).update(HKDF_INFO).digest().subarray(0, AES_KEY_LEN);
}

export function encrypt(
    plaintext: string,
    sharedSecret: Buffer,
): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
    const key = deriveAesKey(sharedSecret);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LEN });
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return { ciphertext: encrypted, iv, authTag: cipher.getAuthTag() };
}

export function decrypt(
    ciphertext: Buffer,
    iv: Buffer,
    authTag: Buffer,
    sharedSecret: Buffer,
): string {
    const key = deriveAesKey(sharedSecret);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LEN });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function sign(payload: string, keys: AgentKeys): string {
    if (keys.signKeyType === "ed25519" && keys.signPrivateKeyEd25519) {
        return cryptoSign(null, Buffer.from(payload, "utf8"), keys.signPrivateKeyEd25519).toString("base64");
    }
    if (keys.signPrivateKey) {
        const s = createSign("SHA256");
        s.update(payload, "utf8");
        return s.sign(keys.signPrivateKey).toString("base64");
    }
    throw new Error("No signing key available");
}

export function verify(
    payload: string,
    signatureBase64: string,
    senderSignPublicB64: string,
    senderSignKeyType: SignKeyType,
): boolean {
    if (senderSignKeyType === "ed25519") {
        const pubKey = importSignPublicEd25519(senderSignPublicB64);
        return cryptoVerify(null, Buffer.from(payload, "utf8"), pubKey, Buffer.from(signatureBase64, "base64"));
    }
    const pubKey = importSignPublic(senderSignPublicB64);
    const v = createVerify("SHA256");
    v.update(payload, "utf8");
    return v.verify(pubKey, Buffer.from(signatureBase64, "base64"));
}

export function exportEcdhPublicBase64(ecdhPublic: Buffer): string {
    return ecdhPublic.toString("base64");
}

export function exportSignPublicBase64(keys: AgentKeys): { value: string; signKeyType: SignKeyType } {
    if (keys.signKeyType === "ed25519" && keys.signPublicKeyEd25519) {
        const raw = keys.signPublicKeyEd25519.export({ type: "spki", format: "der" });
        return { value: raw.subarray(-32).toString("base64"), signKeyType: "ed25519" };
    }
    if (keys.signPublicKey) {
        return { value: keys.signPublicKey.export({ type: "spki", format: "der" }).toString("base64"), signKeyType: "ecdsa" };
    }
    throw new Error("No signing public key");
}

export function importEcdhPublic(base64: string): Buffer {
    return Buffer.from(base64, "base64");
}

function importSignPublic(base64: string): KeyObject {
    return createPublicKey({ key: Buffer.from(base64, "base64"), format: "der", type: "spki" });
}

function importSignPublicEd25519(base64: string): KeyObject {
    const spki = ed25519RawPublicToSpki(Buffer.from(base64, "base64"));
    return createPublicKey({ key: spki, format: "der", type: "spki" });
}

function importEcdhPrivate(base64: string): Buffer {
    return Buffer.from(base64, "base64");
}

function importSignPrivateEd25519(base64: string): KeyObject {
    const der = ed25519RawPrivateToPkcs8(Buffer.from(base64, "base64"));
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

/**
 * Build AgentKeys from ECDH private key + Ed25519 keys from 1Claw __agent-keys.
 */
export function agentKeysFromStored(
    ecdhPrivateB64: string,
    ed25519PrivateKeyB64: string,
    ed25519PublicKeyB64: string,
): AgentKeys {
    const ecdhPrivate = importEcdhPrivate(ecdhPrivateB64);
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(ecdhPrivate);
    return {
        ecdhPrivate,
        ecdhPublic: ecdh.getPublicKey(),
        signKeyType: "ed25519",
        signPrivateKeyEd25519: importSignPrivateEd25519(ed25519PrivateKeyB64),
        signPublicKeyEd25519: importSignPublicEd25519(ed25519PublicKeyB64),
    };
}
