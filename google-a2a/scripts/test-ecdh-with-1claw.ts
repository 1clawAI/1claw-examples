/**
 * Test the ECDH demo with 1Claw: bootstrap keys → run demo → cleanup.
 * Ensures the demo works with keys stored in two vaults and leaves no
 * ECDH secrets behind.
 *
 * Set: ONECLAW_ALICE_VAULT_ID, ONECLAW_ALICE_API_KEY,
 *      ONECLAW_BOB_VAULT_ID, ONECLAW_BOB_API_KEY
 * Then: npm run ecdh:test
 */

import { spawnSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function runScript(script: string, label: string): boolean {
    console.log(`\n--- ${label} ---\n`);
    const r = spawnSync("npx", ["tsx", script], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    });
    if (r.status !== 0) {
        console.error(`${label} failed with code ${r.status}`);
        return false;
    }
    return true;
}

async function main() {
    const required = [
        "ONECLAW_ALICE_VAULT_ID",
        "ONECLAW_ALICE_API_KEY",
        "ONECLAW_BOB_VAULT_ID",
        "ONECLAW_BOB_API_KEY",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
        console.error("Missing env vars:", missing.join(", "));
        console.error("Set them (e.g. in .env) then run: npm run ecdh:test");
        process.exit(1);
    }

    console.log("ECDH demo test with 1Claw (bootstrap → demo → cleanup)\n");

    if (!runScript("scripts/bootstrap-ecdh-keys.ts", "1. Bootstrap keys into both vaults")) {
        process.exit(1);
    }

    console.log("\n--- 2. Run ECDH demo (Alice + Bob + coordinator) ---\n");
    const demo = spawn("npx", ["tsx", "src/start-ecdh-demo.ts"], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    });

    const exitCode = await new Promise<number>((resolve) => {
        demo.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });

    if (exitCode !== 0) {
        console.error("\nDemo exited with code", exitCode);
        runScript("scripts/cleanup-ecdh-keys.ts", "3. Cleanup (remove secrets from both vaults)");
        process.exit(exitCode);
    }

    if (!runScript("scripts/cleanup-ecdh-keys.ts", "3. Cleanup (remove secrets from both vaults)")) {
        process.exit(1);
    }

    console.log("\nTest complete: demo ran with 1Claw and cleanup succeeded.\n");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
