/**
 * 1Claw SDK — Non-EVM Transaction Signing (Bitcoin, Solana, XRP, Cardano, Tron)
 *
 * Signs (and, unless --sign-only, broadcasts) a native transfer on a non-EVM
 * testnet. The private key stays inside the HSM/TEE — the agent only submits an
 * intent. 1Claw dispatches by chain family, auto-fetches the chain data it needs
 * (Bitcoin UTXOs/fee, Solana blockhash, XRP sequence, Cardano protocol params,
 * Tron ref block), signs, and broadcasts.
 *
 * Usage:
 *   npm run sign -- <chain> <recipient> <amount> [--sign-only]
 *
 * Examples:
 *   npm run sign -- solana-devnet   9WzD...WWM  0.001
 *   npm run sign -- bitcoin-testnet tb1q...     0.0001
 *   npm run sign -- xrp-testnet     rPT1...      1        # add --dtag 12345 for a destination tag
 *   npm run sign -- cardano-preprod addr_test1...2        # requires BLOCKFROST_PROJECT_ID_PREPROD server-side
 *   npm run sign -- tron-shasta     TJRa...       1
 *
 * A signing key must already be provisioned for the chain family (run the
 * per-chain scripts first, e.g. `npm run solana`). `amount` is the human-readable
 * major unit (BTC/SOL/XRP/ADA/TRX) as a decimal string.
 */

import {
    createClient,
    type SubmitTransactionRequest,
    type SignTransactionRequest,
} from "@1claw/sdk";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;

if (!AGENT_API_KEY || !AGENT_ID) {
    console.error("Set ONECLAW_AGENT_API_KEY and ONECLAW_AGENT_ID in your .env file");
    process.exit(1);
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));
const [chain, to, amount] = positional;
const signOnly = flags.has("--sign-only");

// Optional XRP destination tag: --dtag 12345
const dtagIdx = argv.indexOf("--dtag");
const destinationTag =
    dtagIdx >= 0 && argv[dtagIdx + 1] ? Number(argv[dtagIdx + 1]) : undefined;

// Optional SPL / TRC-20 token: --token <mint/contract> [--decimals N]
const tokenIdx = argv.indexOf("--token");
const tokenMint = tokenIdx >= 0 ? argv[tokenIdx + 1] : undefined;
const decIdx = argv.indexOf("--decimals");
const tokenDecimals = decIdx >= 0 && argv[decIdx + 1] ? Number(argv[decIdx + 1]) : undefined;

if (!chain || !to || !amount) {
    console.error(
        "Usage: npm run sign -- <chain> <recipient> <amount> [--sign-only] [--dtag N] [--token <mint> --decimals N]",
    );
    process.exit(1);
}

const EXPLORERS: Record<string, (h: string) => string> = {
    "bitcoin-testnet": (h) => `https://mempool.space/testnet/tx/${h}`,
    "solana-devnet": (h) => `https://solscan.io/tx/${h}?cluster=devnet`,
    "xrp-testnet": (h) => `https://testnet.xrpl.org/transactions/${h}`,
    "cardano-preprod": (h) => `https://preprod.cardanoscan.io/transaction/${h}`,
    "tron-shasta": (h) => `https://shasta.tronscan.org/#/transaction/${h}`,
};

async function main() {
    console.log(`Non-EVM ${signOnly ? "sign-only" : "sign + broadcast"} — ${chain}\n`);

    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY,
        agentId: AGENT_ID,
    });

    const body: SubmitTransactionRequest & SignTransactionRequest = {
        chain: chain!,
        to: to!,
        value: amount!,
    };
    if (destinationTag !== undefined) body.destination_tag = destinationTag;
    if (tokenMint) body.token_mint = tokenMint;
    if (tokenDecimals !== undefined) body.token_decimals = tokenDecimals;

    console.log("  Intent:", JSON.stringify(body));
    console.log();

    const res = signOnly
        ? await client.agents.signTransaction(AGENT_ID!, body)
        : await client.agents.submitTransaction(AGENT_ID!, body);

    if (res.error) {
        const msg = res.error.detail ?? res.error.message ?? JSON.stringify(res.error);
        console.error("  Signing failed:", msg);
        console.error(
            "\n  Common causes: no signing key provisioned for this chain (run the per-chain\n" +
            "  script first), the from-address is unfunded, or (Cardano) BLOCKFROST_PROJECT_ID_PREPROD\n" +
            "  is not configured server-side.",
        );
        process.exit(1);
    }

    const data = res.data as {
        tx_hash?: string;
        from?: string;
        status?: string;
        signed_tx?: string;
        raw_tx?: string;
    };

    console.log("--- Result ---\n");
    console.log(`  From:    ${data.from ?? "-"}`);
    console.log(`  To:      ${to}`);
    console.log(`  Amount:  ${amount}`);
    console.log(`  Status:  ${data.status ?? "-"}`);
    console.log(`  Tx hash: ${data.tx_hash ?? "-"}`);
    const rawTx = data.raw_tx ?? data.signed_tx;
    if (rawTx) console.log(`  Raw tx:  ${rawTx.slice(0, 24)}…`);

    const explorer = data.tx_hash ? EXPLORERS[chain]?.(data.tx_hash) : undefined;
    if (explorer) console.log(`\n  Explorer: ${explorer}`);

    if (signOnly) {
        console.log("\n  Sign-only: broadcast the raw transaction with your own RPC when ready.");
    }
}

/**
 * Demonstrates xrpl_tx_json for arbitrary XRPL transaction types beyond simple
 * Payment. The field accepts full XRPL transaction JSON — Account, Sequence, Fee,
 * and SigningPubKey are auto-filled by the server.
 */
async function xrplTxJsonDemo() {
    console.log("\n\n=== XRP xrpl_tx_json Demo (arbitrary transaction types) ===\n");

    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY,
        agentId: AGENT_ID,
    });

    const XRP_FAUCET = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"; // testnet faucet

    // --- XRP TrustSet via xrpl_tx_json ---
    console.log("--- XRP TrustSet (xrpl_tx_json) ---");
    const trustSetResult = await client.agents.signTransaction(AGENT_ID!, {
        chain: "xrp-testnet",
        to: XRP_FAUCET,
        value: "0",
        xrpl_tx_json: {
            TransactionType: "TrustSet",
            LimitAmount: {
                currency: "USD",
                issuer: XRP_FAUCET,
                value: "1000",
            },
        },
    });

    if (trustSetResult.error) {
        console.error("  TrustSet failed:", trustSetResult.error.detail ?? trustSetResult.error.message);
    } else {
        const data = trustSetResult.data as { tx_hash?: string; from?: string; signed_tx?: string };
        console.log(`  From:    ${data.from ?? "-"}`);
        console.log(`  Tx hash: ${data.tx_hash ?? "-"}`);
        if (data.signed_tx) console.log(`  Raw tx:  ${data.signed_tx.slice(0, 24)}…`);
    }

    // --- XRP OfferCreate via xrpl_tx_json ---
    console.log("\n--- XRP OfferCreate (xrpl_tx_json) ---");
    const offerResult = await client.agents.signTransaction(AGENT_ID!, {
        chain: "xrp-testnet",
        to: XRP_FAUCET,
        value: "0",
        xrpl_tx_json: {
            TransactionType: "OfferCreate",
            TakerPays: {
                currency: "USD",
                issuer: XRP_FAUCET,
                value: "100",
            },
            TakerGets: "50000000", // 50 XRP in drops
        },
    });

    if (offerResult.error) {
        console.error("  OfferCreate failed:", offerResult.error.detail ?? offerResult.error.message);
    } else {
        const data = offerResult.data as { tx_hash?: string; from?: string };
        console.log(`  From:    ${data.from ?? "-"}`);
        console.log(`  Tx hash: ${data.tx_hash ?? "-"}`);
    }

    console.log("\n--- Available XRPL transaction types ---");
    console.log("  Payment, TrustSet, OfferCreate, OfferCancel, AccountSet,");
    console.log("  AccountDelete, EscrowCreate, EscrowFinish, EscrowCancel,");
    console.log("  PaymentChannelCreate, PaymentChannelFund, PaymentChannelClaim,");
    console.log("  NFTokenMint, NFTokenBurn, NFTokenCreateOffer, NFTokenAcceptOffer,");
    console.log("  NFTokenCancelOffer, AMMCreate, AMMDeposit, AMMWithdraw, AMMBid,");
    console.log("  AMMDelete, AMMVote, SetRegularKey, SignerListSet, DepositPreauth,");
    console.log("  CheckCreate, CheckCash, CheckCancel, TicketCreate, Clawback");
}

/**
 * Demonstrates SPL / TRC-20 token transfers using token_mint and token_decimals.
 * The server builds the token-specific transfer instruction automatically.
 *
 * Usage:
 *   npm run sign -- solana-devnet <recipient> 10 --token <spl_mint> --decimals 6
 *   npm run sign -- tron-shasta   <recipient> 50 --token <trc20_contract> --decimals 6
 */
async function tokenTransferDemo() {
    console.log("\n\n=== Token Transfer Demo (SPL / TRC-20) ===\n");

    const client = createClient({
        baseUrl: BASE_URL,
        apiKey: AGENT_API_KEY,
        agentId: AGENT_ID,
    });

    // --- Solana SPL token transfer ---
    console.log("--- Solana SPL Token Transfer (sign-only) ---");
    const splResult = await client.agents.signTransaction(AGENT_ID!, {
        chain: "solana-devnet",
        to: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        value: "10",
        token_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC on Solana
        token_decimals: 6,
    });

    if (splResult.error) {
        console.error("  SPL transfer failed:", splResult.error.detail ?? splResult.error.message);
    } else {
        const data = splResult.data as { tx_hash?: string; from?: string; status?: string };
        console.log(`  From:   ${data.from ?? "-"}`);
        console.log(`  Status: ${data.status ?? "-"}`);
        console.log(`  Hash:   ${data.tx_hash ?? "-"}`);
    }

    // --- Tron TRC-20 token transfer ---
    console.log("\n--- Tron TRC-20 Token Transfer (sign-only) ---");
    const trcResult = await client.agents.signTransaction(AGENT_ID!, {
        chain: "tron-shasta",
        to: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
        value: "50",
        token_mint: "TG3XXyExBkFU9nQGf5GLbRNtUN6K9JQE4H", // USDT on Tron Shasta
        token_decimals: 6,
    });

    if (trcResult.error) {
        console.error("  TRC-20 transfer failed:", trcResult.error.detail ?? trcResult.error.message);
    } else {
        const data = trcResult.data as { tx_hash?: string; from?: string; status?: string };
        console.log(`  From:   ${data.from ?? "-"}`);
        console.log(`  Status: ${data.status ?? "-"}`);
        console.log(`  Hash:   ${data.tx_hash ?? "-"}`);
    }
}

// Run xrpl_tx_json demo when chain is xrp-testnet and --xrpl-demo flag is present
if (flags.has("--xrpl-demo") || (chain === "xrp-testnet" && flags.has("--advanced"))) {
    xrplTxJsonDemo().catch(console.error);
} else if (flags.has("--token-demo")) {
    tokenTransferDemo().catch(console.error);
} else {
    main().catch(console.error);
}
