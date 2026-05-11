/**
 * 1Claw SDK — Multi-Chain Signing Keys: Provision
 *
 * Provisions HSM-backed signing keys for all 6 supported chains.
 * Private keys never leave the HSM — only public keys and derived
 * addresses are returned.
 *
 * Prerequisites:
 *   - ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID set in .env
 *   - Agent must have Intents API enabled
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!AGENT_API_KEY || !AGENT_ID) {
    console.error(
        "Set ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID in your .env file",
    );
    process.exit(1);
}

const SUPPORTED_CHAINS = [
    "ethereum",
    "bitcoin",
    "solana",
    "xrp",
    "cardano",
    "tron",
] as const;

const EXPLORER_URLS: Record<string, (addr: string) => string> = {
    ethereum: (addr) => `https://etherscan.io/address/${addr}`,
    bitcoin: (addr) => `https://mempool.space/address/${addr}`,
    solana: (addr) => `https://solscan.io/account/${addr}`,
    xrp: (addr) => `https://xrpscan.com/account/${addr}`,
    cardano: (addr) => `https://cardanoscan.io/address/${addr}`,
    tron: (addr) => `https://tronscan.org/#/address/${addr}`,
};

interface KeyResult {
    chain: string;
    curve: string;
    public_key: string;
    address: string;
    status: "created" | "already_provisioned" | "error";
    error?: string;
}

function truncate(s: string, len: number): string {
    if (s.length <= len) return s;
    const half = Math.floor((len - 3) / 2);
    return s.slice(0, half) + "..." + s.slice(-half);
}

function padRight(s: string, len: number): string {
    return s + " ".repeat(Math.max(0, len - s.length));
}

function printTable(results: KeyResult[]) {
    const cols = {
        chain: 13,
        curve: 11,
        publicKey: 20,
        address: 42,
    };

    const hr = `├${"─".repeat(cols.chain)}┼${"─".repeat(cols.curve)}┼${"─".repeat(cols.publicKey)}┼${"─".repeat(cols.address)}┤`;
    const top = `┌${"─".repeat(cols.chain)}┬${"─".repeat(cols.curve)}┬${"─".repeat(cols.publicKey)}┬${"─".repeat(cols.address)}┐`;
    const bot = `└${"─".repeat(cols.chain)}┴${"─".repeat(cols.curve)}┴${"─".repeat(cols.publicKey)}┴${"─".repeat(cols.address)}┘`;

    console.log(top);
    console.log(
        `│${padRight(" Chain", cols.chain)}│${padRight(" Curve", cols.curve)}│${padRight(" Public Key", cols.publicKey)}│${padRight(" Address", cols.address)}│`,
    );
    console.log(hr);

    for (const r of results) {
        if (r.status === "error") {
            console.log(
                `│${padRight(` ${r.chain}`, cols.chain)}│${padRight(` -`, cols.curve)}│${padRight(` ERROR: ${r.error ?? "unknown"}`, cols.publicKey + cols.address + 1)}│`,
            );
            continue;
        }
        const label =
            r.status === "already_provisioned"
                ? ` ${r.chain} (exists)`
                : ` ${r.chain}`;
        console.log(
            `│${padRight(label, cols.chain)}│${padRight(` ${r.curve}`, cols.curve)}│${padRight(` ${truncate(r.public_key, cols.publicKey - 2)}`, cols.publicKey)}│${padRight(` ${truncate(r.address, cols.address - 2)}`, cols.address)}│`,
        );
    }

    console.log(bot);
}

async function main() {
    console.log("Multi-Chain Signing Keys — Provision\n");

    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY,
        agentId: AGENT_ID,
    });

    const results: KeyResult[] = [];

    for (const chain of SUPPORTED_CHAINS) {
        process.stdout.write(`  Provisioning ${chain}...`);

        const res = await client.signingKeys.create(AGENT_ID!, { chain });

        if (res.error) {
            const msg = res.error.message ?? res.error.detail ?? "";
            if (msg.includes("already") || msg.includes("409")) {
                process.stdout.write(" already provisioned\n");
                const listRes = await client.signingKeys.list(AGENT_ID!);
                const existing = listRes.data?.keys?.find(
                    (k) => k.chain === chain && k.is_active,
                );
                results.push({
                    chain,
                    curve: existing?.curve ?? "unknown",
                    public_key: existing?.public_key ?? "-",
                    address: existing?.address ?? "-",
                    status: "already_provisioned",
                });
            } else {
                process.stdout.write(` error: ${msg}\n`);
                results.push({
                    chain,
                    curve: "",
                    public_key: "",
                    address: "",
                    status: "error",
                    error: msg,
                });
            }
            continue;
        }

        const key = res.data!;
        process.stdout.write(" done\n");
        results.push({
            chain,
            curve: key.curve,
            public_key: key.public_key,
            address: key.address ?? "-",
            status: "created",
        });
    }

    console.log("\n--- Signing Keys ---\n");
    printTable(results);

    const funded = results.filter(
        (r) => r.status !== "error" && r.address !== "-",
    );
    if (funded.length > 0) {
        console.log("\n--- Funding Guide ---\n");
        console.log(
            "Send native tokens to each address to enable transactions:\n",
        );
        for (const r of funded) {
            const url = EXPLORER_URLS[r.chain]?.(r.address) ?? r.address;
            console.log(`  ${padRight(r.chain, 12)} ${url}`);
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
