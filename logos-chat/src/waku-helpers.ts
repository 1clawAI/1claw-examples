/**
 * Waku/Logos light node helpers for the chat demo.
 *
 * Wraps @waku/sdk (Logos Delivery JS) for creating a light node,
 * publishing messages via Light Push, and subscribing via Filter.
 */

// Polyfill Promise.withResolvers for Node < 22 (used by @waku/sdk transitive deps)
if (typeof Promise.withResolvers === "undefined") {
    (Promise as any).withResolvers = function <T>() {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
    };
}

import {
    createLightNode,
    createEncoder,
    createDecoder,
    waitForRemotePeer,
    Protocols,
    type LightNode,
} from "@waku/sdk";
import { AutoShardingRoutingInfo } from "@waku/utils";

export const CONTENT_TOPIC = "/1claw-logos-chat/1/messages/proto";

const NETWORK_CONFIG = {
    clusterId: 1,
    numShardsInCluster: 8,
    contentTopics: [CONTENT_TOPIC],
};

const ROUTING_INFO = AutoShardingRoutingInfo.fromContentTopic(CONTENT_TOPIC, NETWORK_CONFIG);

export type { LightNode };

/**
 * Create a Waku light node connected to the Logos network.
 */
export async function createChatNode(): Promise<LightNode> {
    const node = await createLightNode({
        defaultBootstrap: true,
        networkConfig: NETWORK_CONFIG,
    });
    await node.start();
    return node;
}

/**
 * Wait for the node to find LightPush and Filter peers.
 * Throws if peers are not found within the timeout.
 */
export async function waitForPeers(node: LightNode, timeoutMs = 30_000): Promise<void> {
    await Promise.race([
        waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter]),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("No Waku peers found (timeout)")), timeoutMs),
        ),
    ]);
}

/**
 * Publish a serialized message to the chat content topic via Light Push.
 */
export async function publishMessage(node: LightNode, payload: Uint8Array): Promise<void> {
    const encoder = createEncoder({
        contentTopic: CONTENT_TOPIC,
        routingInfo: ROUTING_INFO,
        ephemeral: true,
    });
    const result = await node.lightPush.send(encoder, { payload });
    if (result?.failures && result.failures.length > 0) {
        throw new Error(`Light Push failed: ${JSON.stringify(result.failures)}`);
    }
}

/**
 * Subscribe to incoming messages on the chat content topic via Filter.
 * Returns an unsubscribe function.
 */
export async function subscribeToMessages(
    node: LightNode,
    callback: (payload: Uint8Array) => void,
): Promise<() => Promise<void>> {
    const decoder = createDecoder(CONTENT_TOPIC, ROUTING_INFO);

    const success = await node.filter.subscribe(
        [decoder],
        (wakuMessage: any) => {
            if (wakuMessage?.payload) {
                callback(new Uint8Array(wakuMessage.payload));
            }
        },
    );

    if (success === false) {
        throw new Error("Filter subscribe failed");
    }

    return async () => {
        try { node.filter.unsubscribeAll(); } catch {}
    };
}
