/**
 * Bootstrap script for the Logos Chat UI demo.
 *
 * Takes a single 1Claw API key, creates two agents (Alice and Bob),
 * grants them read access to __agent-keys, and writes `.env`.
 *
 * Interactive (demo-friendly — master key masked with asterisks):
 *   npm run bootstrap
 *
 * Non-interactive / CI:
 *   ONECLAW_API_KEY=1ck_... npm run bootstrap
 *
 * Optional env:
 *   LLM_PROVIDER=google          (default: google)
 *   LLM_API_KEY=...              BYOK only; omit to use org LLM token billing via Shroud
 *   ONECLAW_BASE_URL=https://... (default: https://api.1claw.co)
 *   SHROUD_URL=https://...       (default: https://shroud.1claw.co)
 */

import { writeFileSync } from "fs";
import { createInterface } from "node:readline";
import { provisionAliceAndBob } from "../src/lib/provision-agents";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const SHROUD_URL = process.env.SHROUD_URL ?? "https://shroud.1claw.co";
const LLM_PROVIDER = process.env.LLM_PROVIDER ?? "google";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "";

/**
 * Read one line with each character echoed as `*` (paste supported).
 * If raw mode is unavailable, falls back to visible readline (rare).
 */
function readSecretLine(prompt: string): Promise<string> {
    process.stderr.write(prompt);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
        return Promise.reject(new Error("stdin is not a TTY"));
    }

    let line = "";
    const wasRaw = stdin.isRaw;

    try {
        stdin.setRawMode(true);
    } catch {
        return new Promise((resolve) => {
            const rl = createInterface({ input: stdin, output: process.stderr });
            rl.question("", (answer) => {
                rl.close();
                try {
                    stdin.pause();
                } catch {
                    /* ignore */
                }
                try {
                    stdin.unref();
                } catch {
                    /* ignore */
                }
                resolve(answer);
            });
        });
    }

    stdin.resume();
    stdin.setEncoding("utf8");

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            try {
                stdin.setRawMode(wasRaw ?? false);
            } catch {
                /* ignore */
            }
            stdin.removeListener("data", onData);
            // Raw mode + resume() can leave stdin ref'd so Node never exits; release it.
            try {
                stdin.pause();
            } catch {
                /* ignore */
            }
            try {
                stdin.unref();
            } catch {
                /* ignore */
            }
        };

        const onData = (chunk: string) => {
            for (const char of chunk) {
                const code = char.charCodeAt(0);
                if (code === 3) {
                    cleanup();
                    process.stderr.write("\n");
                    process.exit(130);
                }
                if (char === "\r" || char === "\n") {
                    cleanup();
                    process.stderr.write("\n");
                    resolve(line);
                    return;
                }
                if (char === "\u007f" || char === "\b") {
                    if (line.length > 0) {
                        line = line.slice(0, -1);
                        process.stderr.write("\b \b");
                    }
                    continue;
                }
                if (char >= " " || char === "\t") {
                    line += char;
                    process.stderr.write("*");
                }
            }
        };

        stdin.on("data", onData);
        stdin.once("error", (err) => {
            cleanup();
            reject(err);
        });
    });
}

async function resolveUserApiKey(): Promise<string> {
    const fromEnv = process.env.ONECLAW_API_KEY?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    if (!process.stdin.isTTY) {
        console.error(
            "Set ONECLAW_API_KEY in the environment, or run in a terminal for masked (asterisk) input.",
        );
        console.error("Example: ONECLAW_API_KEY=1ck_... npm run bootstrap");
        process.exit(1);
    }

    console.error("");
    console.error("Paste your 1Claw API key (1ck_...). Each character appears as *.");
    console.error("Press Enter when done. (A long pause after Enter is normal while agents are created.)");
    console.error("");

    try {
        const key = (await readSecretLine("ONECLAW_API_KEY: ")).trim();
        if (!key) {
            console.error("No API key entered.");
            process.exit(1);
        }
        console.log("Key received.\n");
        return key;
    } catch {
        console.error("Could not read from terminal.");
        process.exit(1);
    }
}

async function main() {
    console.log("🔐 1Claw × Logos Chat — Bootstrap\n");

    const USER_API_KEY = await resolveUserApiKey();

    console.log("Creating agents and granting key access (calling 1Claw API — usually 10–40s)…");
    let pair;
    try {
        pair = await provisionAliceAndBob(BASE_URL, USER_API_KEY);
    } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    }

    const alice = pair.alice;
    const bob = pair.bob;
    console.log(`  Alice: ${alice.id}`);
    console.log(`  Bob:   ${bob.id}\n`);

    // Write .env
    const envLines = [
        "# Logos Chat — generated by npm run bootstrap",
        `# ${new Date().toISOString()}`,
        "",
        `ONECLAW_BASE_URL=${BASE_URL}`,
        `SHROUD_URL=${SHROUD_URL}`,
        "",
        "# Alice",
        `ONECLAW_ALICE_AGENT_ID=${alice.id}`,
        `ONECLAW_ALICE_API_KEY=${alice.apiKey}`,
        "",
        "# Bob",
        `ONECLAW_BOB_AGENT_ID=${bob.id}`,
        `ONECLAW_BOB_API_KEY=${bob.apiKey}`,
        "",
        "# Shroud LLM — AI auto-chat uses each agent's key against Shroud.",
        "# Leave LLM_API_KEY empty for org LLM token billing (Stripe AI Gateway on Shroud).",
        "# Set LLM_API_KEY only for BYOK (your provider key; skips org billing on that path).",
        `LLM_PROVIDER=${LLM_PROVIDER}`,
        `LLM_API_KEY=${LLM_API_KEY}`,
        "",
    ];

    const envPath = new URL("../.env", import.meta.url);
    writeFileSync(envPath, envLines.join("\n"), "utf8");

    console.log("Wrote .env\n");
    console.log("Setup complete! Next steps:");
    console.log("  npm run dev        # Start the UI");
    console.log("  npm run cli        # Or run the CLI demo");
    console.log("");
    console.log("AI auto-chat: uses Shroud with Alice/Bob credentials from .env.");
    if (LLM_API_KEY) {
        console.log("  LLM_API_KEY is set → BYOK (your provider key via X-Shroud-Api-Key).");
    } else {
        console.log("  LLM_API_KEY left empty → org LLM token billing via Shroud when enabled in Vault.");
        console.log("  (Optional BYOK: LLM_API_KEY=... ONECLAW_API_KEY=... npm run bootstrap)");
    }

    // After interactive hidden input, stdin can still keep the event loop alive.
    try {
        if (process.stdin.isTTY) {
            process.stdin.pause();
            process.stdin.unref();
        }
    } catch {
        /* ignore */
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
