/**
 * Runs 2-of-2 then 2-of-3 demos. Each block is independent: failure in one
 * still attempts the other (useful when only one tier / environment fits).
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.join(srcDir, "..");

function run(scriptFile: string): Promise<number> {
    return new Promise((resolve) => {
        const child = spawn(
            "npx",
            ["tsx", "--env-file=.env", path.join("src", scriptFile)],
            {
                cwd: exampleRoot,
                stdio: "inherit",
                shell: true,
                env: { ...process.env },
            },
        );
        child.on("close", (code) => resolve(code ?? 1));
    });
}

async function main() {
    console.log("Running MPC examples (2-of-2 then 2-of-3)…\n");
    const a = await run("2of2-client-custody.ts");
    const b = await run("2of3-multi-hsm.ts");
    if (a !== 0) console.error("\n2-of-2 exited with code", a);
    if (b !== 0) console.error("\n2-of-3 exited with code", b);
    process.exit(a !== 0 || b !== 0 ? 1 : 0);
}

main();
