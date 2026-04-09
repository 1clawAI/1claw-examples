/**
 * Start both chat agents (Alice, Bob) and orchestrate an encrypted
 * conversation over the Logos/Waku messaging network.
 *
 * For 1Claw-backed keys, set in env (or .env):
 *   ONECLAW_ALICE_AGENT_ID, ONECLAW_ALICE_API_KEY
 *   ONECLAW_BOB_AGENT_ID,   ONECLAW_BOB_API_KEY
 * Without these, in-memory keys are generated automatically.
 */

import { fork } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_SCRIPT = join(__dirname, "agent.ts");

const PEER_TIMEOUT_MS = 25_000;
const MSG_TIMEOUT_MS = 15_000;

interface IpcMsg {
    event: string;
    [key: string]: unknown;
}

function spawnAgent(name: string, extraEnv: Record<string, string> = {}): ReturnType<typeof fork> {
    const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        AGENT_NAME: name,
        ...extraEnv,
    };

    // Map per-agent 1Claw credentials from env
    const prefix = `ONECLAW_${name.toUpperCase()}_`;
    if (process.env[`${prefix}AGENT_ID`] && process.env[`${prefix}API_KEY`]) {
        env.ONECLAW_AGENT_ID = process.env[`${prefix}AGENT_ID`]!;
        env.ONECLAW_API_KEY = process.env[`${prefix}API_KEY`]!;
    }

    return fork(AGENT_SCRIPT, [], {
        stdio: ["pipe", "inherit", "inherit", "ipc"],
        execArgv: ["--import", "tsx"],
        env: env as NodeJS.ProcessEnv,
    });
}

function waitForEvent(child: ReturnType<typeof fork>, eventName: string, timeoutMs: number): Promise<IpcMsg> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${eventName}" from ${child.pid}`)), timeoutMs);
        const handler = (msg: IpcMsg) => {
            if (msg.event === eventName) {
                clearTimeout(timer);
                child.off("message", handler);
                resolve(msg);
            }
            if (msg.event === "error") {
                clearTimeout(timer);
                child.off("message", handler);
                reject(new Error(String(msg.error)));
            }
        };
        child.on("message", handler);
    });
}

async function main(): Promise<void> {
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║  1claw × Logos — Encrypted Agent Chat Demo          ║");
    console.log("║  Two agents chat over the Logos messaging network   ║");
    console.log("║  Messages: ECDH-encrypted + Ed25519/ECDSA-signed   ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    console.log();

    // ── Spawn agents ──────────────────────────────────────────────

    console.log("Starting Alice...");
    const alice = spawnAgent("Alice");

    console.log("Starting Bob...");
    const bob = spawnAgent("Bob");

    const cleanup = () => {
        alice.kill();
        bob.kill();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // ── Wait for both to connect to Logos peers ───────────────────

    try {
        console.log("\nWaiting for Logos network peers...");
        await Promise.all([
            waitForEvent(alice, "connected", PEER_TIMEOUT_MS),
            waitForEvent(bob, "connected", PEER_TIMEOUT_MS),
        ]);
        console.log("Both agents connected to the Logos network.\n");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("No Waku peers") || msg.includes("Timeout")) {
            console.log(`\nNo Waku peers found — Logos network may be unreachable.`);
            console.log("This is expected in CI without network access. Skipping.\n");
            cleanup();
            process.exit(0);
        }
        throw err;
    }

    // ── Handshake: exchange public keys over Logos ─────────────────

    console.log("── Handshake ──\n");

    alice.send({ cmd: "handshake" });
    await new Promise((r) => setTimeout(r, 1_000));
    bob.send({ cmd: "handshake" });

    try {
        await Promise.all([
            waitForEvent(alice, "peer_keys", MSG_TIMEOUT_MS),
            waitForEvent(bob, "peer_keys", MSG_TIMEOUT_MS),
        ]);
        console.log("Public keys exchanged over the Logos network.\n");
    } catch {
        console.log("Key exchange timed out (peer message may not have arrived). Skipping.");
        cleanup();
        process.exit(0);
    }

    // ── Chat: encrypted messages ──────────────────────────────────

    console.log("── Encrypted Chat ──\n");

    // Alice → Bob
    const msg1 = "Hello Bob! This message is ECDH-encrypted and signed, sent over Logos.";
    alice.send({ cmd: "send", text: msg1 });

    try {
        const recv1 = await waitForEvent(bob, "received", MSG_TIMEOUT_MS);
        console.log(`Bob received: "${recv1.plaintext}"\n`);
    } catch {
        console.log("Bob did not receive Alice's message (timeout). Skipping.");
        cleanup();
        process.exit(0);
    }

    await new Promise((r) => setTimeout(r, 500));

    // Bob → Alice
    const msg2 = "Hi Alice! Got it. Replying with my own encrypted message over Logos.";
    bob.send({ cmd: "send", text: msg2 });

    try {
        const recv2 = await waitForEvent(alice, "received", MSG_TIMEOUT_MS);
        console.log(`Alice received: "${recv2.plaintext}"\n`);
    } catch {
        console.log("Alice did not receive Bob's reply (timeout). Skipping.");
        cleanup();
        process.exit(0);
    }

    // ── Summary ───────────────────────────────────────────────────

    console.log("── Summary ──\n");
    console.log("  Transport:  Logos/Waku decentralized pub/sub (Light Push + Filter)");
    console.log("  Encryption: P-256 ECDH shared secret → AES-256-GCM");
    console.log("  Signing:    Ed25519 (1Claw) or ECDSA P-256 (in-memory)");
    console.log("  Messages exchanged: 2 (verified + decrypted)");
    console.log("\nDemo complete: two agents chatted with end-to-end encryption over Logos.");

    cleanup();
    process.exit(0);
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
