import { createClient } from "@1claw/sdk";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const BASE_URL = process.env.ONECLAW_BASE_URL || "https://api.1claw.xyz";
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const ETH_AMOUNT = parseFloat(process.env.ETH_AMOUNT || "0.0001");

if (!AGENT_ID || !AGENT_API_KEY) {
    console.error(
        "❌ ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY are required.\n" +
            "   Run `npm run setup` first, then update .env.",
    );
    process.exit(1);
}

interface ChainInfo {
    name: string;
    chainId: number;
    explorer: string;
    maxFeePerGas: string;
    maxPriorityFee: string;
}

const CHAINS: ChainInfo[] = [
    {
        name: "ethereum",
        chainId: 1,
        explorer: "https://etherscan.io",
        maxFeePerGas: "30000000000",
        maxPriorityFee: "2000000000",
    },
    {
        name: "base",
        chainId: 8453,
        explorer: "https://basescan.org",
        maxFeePerGas: "1000000000",
        maxPriorityFee: "100000000",
    },
    {
        name: "sepolia",
        chainId: 11155111,
        explorer: "https://sepolia.etherscan.io",
        maxFeePerGas: "30000000000",
        maxPriorityFee: "2000000000",
    },
    {
        name: "base-sepolia",
        chainId: 84532,
        explorer: "https://sepolia.basescan.org",
        maxFeePerGas: "1000000000",
        maxPriorityFee: "100000000",
    },
];

function ethToWei(eth: number): string {
    return BigInt(Math.round(eth * 1e18)).toString();
}

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY!,
        agentId: AGENT_ID!,
    });

    // ── 1. List existing signing keys ───────────────────────────────────

    console.log("\n🔑 Checking existing signing keys...\n");

    const keysResult = await client.signingKeys.list(AGENT_ID!);
    if (keysResult.error) {
        console.error("Failed to list signing keys:", keysResult.error);
        process.exit(1);
    }

    const existingChains = new Set(keysResult.data!.keys.map((k) => k.chain));
    console.log(
        `  Existing keys: ${existingChains.size > 0 ? [...existingChains].join(", ") : "(none)"}`,
    );

    // ── 2. Provision keys for each chain ────────────────────────────────

    console.log("\n⛓️  Provisioning signing keys for all EVM chains...\n");

    const addresses: Record<string, string> = {};

    for (const chain of CHAINS) {
        if (existingChains.has(chain.name)) {
            const existing = keysResult.data!.keys.find(
                (k) => k.chain === chain.name,
            );
            addresses[chain.name] = existing?.address ?? "(unknown)";
            console.log(
                `  ✓ ${chain.name.padEnd(14)} already provisioned → ${addresses[chain.name]}`,
            );
            continue;
        }

        const result = await client.signingKeys.create(AGENT_ID!, {
            chain: chain.name,
        });

        if (result.error) {
            const msg =
                typeof result.error === "object" &&
                "detail" in (result.error as any)
                    ? (result.error as any).detail
                    : JSON.stringify(result.error);

            if (msg?.includes?.("409") || msg?.includes?.("already")) {
                console.log(`  ✓ ${chain.name.padEnd(14)} already exists (409)`);
            } else {
                console.log(`  ✗ ${chain.name.padEnd(14)} failed: ${msg}`);
            }
            continue;
        }

        const key = result.data!;
        addresses[chain.name] = key.address ?? "(pending)";
        console.log(
            `  ✓ ${chain.name.padEnd(14)} provisioned    → ${addresses[chain.name]}`,
        );
    }

    // ── 3. Print funding table ──────────────────────────────────────────

    console.log("\n" + "═".repeat(70));
    console.log("  FUNDING TABLE — send ETH to these addresses");
    console.log("═".repeat(70));

    for (const chain of CHAINS) {
        const addr = addresses[chain.name];
        if (!addr) continue;
        console.log(
            `\n  ${chain.name.padEnd(14)} (chain_id=${String(chain.chainId).padEnd(10)})`,
        );
        console.log(`    ${addr}`);
        console.log(`    ${chain.explorer}/address/${addr}`);
    }

    console.log("\n" + "═".repeat(70));

    // ── 4. Wait for user confirmation ───────────────────────────────────

    const rl = readline.createInterface({ input: stdin, output: stdout });
    await rl.question(
        "\n  Press Enter when addresses are funded to attempt self-transfers...\n",
    );
    rl.close();

    // ── 5. Attempt self-transfers on each chain ─────────────────────────

    const weiValue = ethToWei(ETH_AMOUNT);
    const results: {
        chain: string;
        status: string;
        txHash?: string;
        explorer?: string;
    }[] = [];

    console.log(`\n📤 Sending ${ETH_AMOUNT} ETH self-transfers on each chain...\n`);

    for (const chain of CHAINS) {
        const fromAddr = addresses[chain.name];
        if (!fromAddr || fromAddr.startsWith("(")) {
            results.push({ chain: chain.name, status: "skipped (no address)" });
            continue;
        }

        const signResult = await client.agents.sign(AGENT_ID!, {
            intent_type: "transaction",
            chain: chain.name,
            tx_type: 2,
            to: fromAddr,
            value: weiValue,
            gas_limit: 21000,
            max_fee_per_gas: chain.maxFeePerGas,
            max_priority_fee_per_gas: chain.maxPriorityFee,
        });

        if (signResult.error) {
            const msg =
                typeof signResult.error === "object" &&
                "detail" in (signResult.error as any)
                    ? (signResult.error as any).detail
                    : JSON.stringify(signResult.error);
            results.push({ chain: chain.name, status: `failed: ${msg}` });
            console.log(`  ✗ ${chain.name.padEnd(14)} ${msg}`);
        } else {
            const tx = signResult.data!;
            results.push({
                chain: chain.name,
                status: "signed",
                txHash: tx.tx_hash,
                explorer: `${chain.explorer}/tx/${tx.tx_hash}`,
            });
            console.log(`  ✓ ${chain.name.padEnd(14)} ${tx.tx_hash}`);
        }
    }

    // ── 6. Print summary ────────────────────────────────────────────────

    console.log("\n" + "═".repeat(70));
    console.log("  MULTI-CHAIN TRANSACTION SUMMARY");
    console.log("═".repeat(70));

    for (const r of results) {
        console.log(`\n  ${r.chain}`);
        console.log(`    Status:   ${r.status}`);
        if (r.txHash) {
            console.log(`    Tx hash:  ${r.txHash}`);
        }
        if (r.explorer) {
            console.log(`    Explorer: ${r.explorer}`);
        }
    }

    const signed = results.filter((r) => r.status === "signed").length;
    const failed = results.filter((r) => r.status.startsWith("failed")).length;
    const skipped = results.filter((r) => r.status.startsWith("skipped")).length;

    console.log("\n" + "─".repeat(70));
    console.log(
        `  Total: ${results.length} chains | ✓ ${signed} signed | ✗ ${failed} failed | ⊘ ${skipped} skipped`,
    );
    console.log("─".repeat(70) + "\n");
}

main().catch((err) => {
    console.error("\n❌ Unexpected error:", err);
    process.exit(1);
});
