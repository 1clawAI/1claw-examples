import { createClient } from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL || "https://api.1claw.co";
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const RECIPIENT =
    process.env.RECIPIENT_ADDRESS ||
    "0x0000000000000000000000000000000000000001";
const ETH_AMOUNT = parseFloat(process.env.ETH_AMOUNT || "0.0001");

if (!AGENT_ID || !AGENT_API_KEY) {
    console.error(
        "❌ ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY are required.\n" +
            "   Run `npm run setup` first, then update .env.",
    );
    process.exit(1);
}

function ethToWei(eth: number): string {
    const wei = BigInt(Math.round(eth * 1e18));
    return wei.toString();
}

async function main() {
    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY!,
        agentId: AGENT_ID!,
    });

    const weiValue = ethToWei(ETH_AMOUNT);

    console.log("\n⛓️  Signing ETH transfer on Base (chain_id=8453)\n");
    console.log(`  To:    ${RECIPIENT}`);
    console.log(`  Value: ${ETH_AMOUNT} ETH (${weiValue} wei)`);
    console.log(`  Type:  EIP-1559 (Type 2)\n`);
    console.log("  Base has significantly lower gas fees than Ethereum mainnet.\n");

    const result = await client.agents.sign(AGENT_ID!, {
        intent_type: "transaction",
        chain: "base",
        tx_type: 2,
        to: RECIPIENT,
        value: weiValue,
        gas_limit: 21000,
        max_fee_per_gas: "1000000000",
        max_priority_fee_per_gas: "100000000",
    });

    if (result.error) {
        const msg =
            typeof result.error === "object" && "detail" in (result.error as any)
                ? (result.error as any).detail
                : JSON.stringify(result.error);

        if (msg?.includes?.("insufficient") || msg?.includes?.("funds")) {
            console.error("❌ Insufficient funds on Base. Fund your agent address first.");
            console.error(`   Details: ${msg}`);
        } else if (msg?.includes?.("guardrail") || msg?.includes?.("403")) {
            console.error("❌ Transaction blocked by guardrails.");
            console.error(`   Details: ${msg}`);
        } else {
            console.error("❌ Transaction signing failed:", msg);
        }
        process.exit(1);
    }

    const tx = result.data!;
    console.log("✅ Transaction signed!\n");
    console.log(`  From:      ${tx.from}`);
    console.log(`  Tx hash:   ${tx.tx_hash}`);
    console.log(`  Tx type:   ${tx.tx_type}`);
    if (tx.signed_tx) {
        console.log(`  Signed tx: ${tx.signed_tx.slice(0, 40)}...`);
    }
    console.log(`\n  Explorer:  https://basescan.org/tx/${tx.tx_hash}\n`);
}

main().catch((err) => {
    console.error("\n❌ Unexpected error:", err);
    process.exit(1);
});
