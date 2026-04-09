/**
 * Protobuf message schema for Logos chat messages.
 * Two message types:
 *   "handshake" — broadcasts public keys (plaintext)
 *   "chat"      — encrypted message payload
 */

import protobuf from "protobufjs";

export const ChatMessage = new protobuf.Type("ChatMessage")
    .add(new protobuf.Field("type", 1, "string"))         // "handshake" | "chat"
    .add(new protobuf.Field("timestamp", 2, "uint64"))
    .add(new protobuf.Field("sender", 3, "string"))        // agent name
    .add(new protobuf.Field("senderEcdhPublic", 4, "string"))
    .add(new protobuf.Field("senderSignPublic", 5, "string"))
    .add(new protobuf.Field("signKeyType", 6, "string"))   // "ecdsa" | "ed25519"
    .add(new protobuf.Field("ciphertext", 7, "bytes"))
    .add(new protobuf.Field("iv", 8, "bytes"))
    .add(new protobuf.Field("authTag", 9, "bytes"))
    .add(new protobuf.Field("signature", 10, "string"))
    .add(new protobuf.Field("plaintext", 11, "string"));   // only for handshake (unused for chat)

export interface HandshakePayload {
    type: "handshake";
    timestamp: number;
    sender: string;
    senderEcdhPublic: string;
    senderSignPublic: string;
    signKeyType: string;
}

export interface ChatPayload {
    type: "chat";
    timestamp: number;
    sender: string;
    senderEcdhPublic: string;
    senderSignPublic: string;
    signKeyType: string;
    ciphertext: Uint8Array;
    iv: Uint8Array;
    authTag: Uint8Array;
    signature: string;
}

export type MessagePayload = HandshakePayload | ChatPayload;

export function encodeMessage(msg: MessagePayload): Uint8Array {
    const errMsg = ChatMessage.verify(msg);
    if (errMsg) throw new Error(`Invalid message: ${errMsg}`);
    return ChatMessage.encode(ChatMessage.create(msg)).finish();
}

export function decodeMessage(data: Uint8Array): MessagePayload {
    return ChatMessage.decode(data) as unknown as MessagePayload;
}
