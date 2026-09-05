/**
 * 1Claw SDK — Multi-Chain Signing Keys: List
 *
 * Lists all signing keys provisioned for the agent.
 *
 * Prerequisites:
 *   - ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID set in .env
 */

import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!AGENT_API_KEY || !AGENT_ID) {
    console.error(
        "Set ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID in your .env file",
    );
    process.exit(1);
}

function truncate(s: string, len: number): string {
    if (s.length <= len) return s;
    const half = Math.floor((len - 3) / 2);
    return s.slice(0, half) + "..." + s.slice(-half);
}

function padRight(s: string, len: number): string {
    return s + " ".repeat(Math.max(0, len - s.length));
}

async function main() {
    console.log("Multi-Chain Signing Keys — List\n");

    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY,
        agentId: AGENT_ID,
    });

    const res = await client.signingKeys.list(AGENT_ID!);

    if (res.error) {
        console.error("Failed to list keys:", res.error.message);
        process.exit(1);
    }

    const keys = res.data!.keys ?? [];

    if (keys.length === 0) {
        console.log("No signing keys found. Run `npm run provision` first.");
        return;
    }

    const cols = {
        id: 38,
        chain: 12,
        curve: 11,
        publicKey: 20,
        address: 30,
        version: 9,
        active: 8,
        created: 22,
    };

    const divider = (c: string) =>
        Object.values(cols)
            .map((w) => c.repeat(w))
            .join(c === "─" ? "┼" : c === "━" ? "┯" : "│");

    const top = `┌${Object.values(cols).map((w) => "─".repeat(w)).join("┬")}┐`;
    const mid = `├${Object.values(cols).map((w) => "─".repeat(w)).join("┼")}┤`;
    const bot = `└${Object.values(cols).map((w) => "─".repeat(w)).join("┴")}┘`;

    console.log(top);
    console.log(
        [
            "",
            padRight(" ID", cols.id),
            padRight(" Chain", cols.chain),
            padRight(" Curve", cols.curve),
            padRight(" Public Key", cols.publicKey),
            padRight(" Address", cols.address),
            padRight(" Version", cols.version),
            padRight(" Active", cols.active),
            padRight(" Created", cols.created),
            "",
        ].join("│"),
    );
    console.log(mid);

    for (const k of keys) {
        const created = k.created_at
            ? new Date(k.created_at).toISOString().slice(0, 19).replace("T", " ")
            : "-";
        console.log(
            [
                "",
                padRight(` ${k.id}`, cols.id),
                padRight(` ${k.chain}`, cols.chain),
                padRight(` ${k.curve}`, cols.curve),
                padRight(` ${truncate(k.public_key, cols.publicKey - 2)}`, cols.publicKey),
                padRight(` ${truncate(k.address ?? "-", cols.address - 2)}`, cols.address),
                padRight(` ${k.key_version ?? 1}`, cols.version),
                padRight(` ${k.is_active ? "yes" : "no"}`, cols.active),
                padRight(` ${created}`, cols.created),
                "",
            ].join("│"),
        );
    }

    console.log(bot);
    console.log(`\n${keys.length} key(s) total.`);
}

main().catch(console.error);
