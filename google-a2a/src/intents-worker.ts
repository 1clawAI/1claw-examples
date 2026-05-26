/**
 * Intents Worker — A2A agent backed by the 1Claw Intents API
 *
 * Exposes transaction signing, simulation, and balance checking via A2A protocol.
 * The agent never holds the private key — signing happens in the 1Claw TEE.
 *
 * Skills:
 *   - sign-transaction: Sign a transaction (without broadcast)
 *   - submit-transaction: Sign and broadcast a transaction
 *   - simulate-transaction: Dry-run via Tenderly
 *   - get-balance: Check the signer's ETH balance
 *   - list-transactions: Recent transaction history
 */

import express from "express";
import { createClient } from "@1claw/sdk";
import type {
    AgentCard,
    SendTaskRequest,
    SendTaskResponse,
    Task,
    Artifact,
} from "./a2a-types.js";

const PORT = parseInt(process.env.WORKER_PORT ?? "4300", 10);
const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const CHAIN = process.env.INTENTS_CHAIN ?? "base-sepolia";
const SIGNER_ADDRESS = process.env.INTENTS_SIGNER_ADDRESS;

if (!API_KEY || !AGENT_ID) {
    console.error("Required: ONECLAW_API_KEY, ONECLAW_AGENT_ID");
    console.error("Run: npm run intents:setup");
    process.exit(1);
}

const sdk = createClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    agentId: AGENT_ID,
});

const app = express();
app.use(express.json());

// ── Agent Card ──────────────────────────────────────────────────────

const agentCard: AgentCard = {
    name: "1Claw Intents Worker",
    description:
        `An A2A agent that signs and broadcasts transactions via the 1Claw Intents API. ` +
        `Chain: ${CHAIN}. Signer: ${SIGNER_ADDRESS ?? "auto"}. ` +
        `All transactions are signed in a TEE with guardrails enforced server-side.`,
    url: `http://localhost:${PORT}`,
    version: "0.1.0",
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    skills: [
        {
            id: "sign-transaction",
            name: "Sign Transaction",
            description: "Sign a transaction without broadcasting. Returns the signed tx hex.",
            tags: ["intents", "sign", "transaction", "1claw"],
            examples: ["Sign a transfer of 0.001 ETH to 0x1234..."],
        },
        {
            id: "submit-transaction",
            name: "Submit Transaction",
            description: "Sign and broadcast a transaction on-chain.",
            tags: ["intents", "submit", "transaction", "1claw"],
            examples: ["Send 0.001 ETH to 0x1234..."],
        },
        {
            id: "simulate-transaction",
            name: "Simulate Transaction",
            description: "Dry-run a transaction via Tenderly. Shows gas, balance changes, and revert status.",
            tags: ["intents", "simulate", "transaction", "1claw"],
            examples: ["Simulate sending 0.01 ETH to 0x1234..."],
        },
        {
            id: "list-transactions",
            name: "List Transactions",
            description: "List recent transactions for this agent.",
            tags: ["intents", "history", "1claw"],
        },
        {
            id: "get-signer-info",
            name: "Get Signer Info",
            description: "Show the signer address, chain, and agent guardrails.",
            tags: ["intents", "info", "1claw"],
        },
    ],
};

app.get("/.well-known/agent.json", (_req, res) => {
    res.json(agentCard);
});

// ── Helpers ─────────────────────────────────────────────────────────

function parseAddress(text: string): string | null {
    const match = text.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : null;
}

function parseEthAmount(text: string): string | null {
    const match = text.match(/(\d+\.?\d*)\s*(?:ETH|eth|Eth)/);
    return match ? match[1] : null;
}

// ── Task Handler ────────────────────────────────────────────────────

app.post("/", async (req, res) => {
    const rpc = req.body as SendTaskRequest;

    if (rpc.method !== "tasks/send") {
        res.status(400).json({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32601, message: `Unknown method: ${rpc.method}` },
        });
        return;
    }

    const { id, message } = rpc.params;
    const userText = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");

    console.log(`[intents-worker] Task ${id}: "${userText}"`);

    const task: Task = {
        id,
        sessionId: rpc.params.sessionId ?? id,
        status: { state: "working", timestamp: new Date().toISOString() },
        messages: [message],
    };

    try {
        const artifacts: Artifact[] = [];

        // ── Sign transaction (no broadcast) ─────────────────────────
        if (/\bsign\b/i.test(userText) && !/submit|send|broadcast/i.test(userText)) {
            const to = parseAddress(userText);
            const eth = parseEthAmount(userText) ?? "0";
            if (!to) throw new Error("No valid address found in request. Include a 0x... address.");

            const result = await sdk.agents.signTransaction(AGENT_ID!, {
                to,
                value: eth,
                chain: CHAIN,
            });
            if (result.error) throw new Error(result.error.message);

            artifacts.push({
                name: "signed-transaction",
                description: "Transaction signed (not broadcast)",
                parts: [{
                    type: "data",
                    data: {
                        status: result.data!.status,
                        tx_hash: result.data!.tx_hash,
                        from: result.data!.from,
                        to: result.data!.to,
                        chain: result.data!.chain,
                        nonce: result.data!.nonce,
                        value_wei: result.data!.value_wei,
                        signed_tx_length: result.data!.signed_tx.length,
                    },
                }],
            });
        }

        // ── Submit transaction (sign + broadcast) ───────────────────
        else if (/submit|send|broadcast|transfer/i.test(userText)) {
            const to = parseAddress(userText);
            const eth = parseEthAmount(userText) ?? "0";
            if (!to) throw new Error("No valid address found in request. Include a 0x... address.");

            const result = await sdk.agents.submitTransaction(AGENT_ID!, {
                to,
                value: eth,
                chain: CHAIN,
                simulate_first: true,
            });
            if (result.error) throw new Error(result.error.message);

            artifacts.push({
                name: "submitted-transaction",
                description: "Transaction signed and broadcast",
                parts: [{
                    type: "data",
                    data: {
                        status: result.data!.status,
                        tx_hash: result.data!.tx_hash,
                        to: result.data!.to,
                        chain: result.data!.chain,
                        chain_id: result.data!.chain_id,
                        value_wei: result.data!.value_wei,
                    },
                }],
            });
        }

        // ── Simulate ────────────────────────────────────────────────
        else if (/simulat/i.test(userText)) {
            const to = parseAddress(userText);
            const eth = parseEthAmount(userText) ?? "0";
            if (!to) throw new Error("No valid address found in request. Include a 0x... address.");

            const result = await sdk.agents.simulateTransaction(AGENT_ID!, {
                to,
                value: eth,
                chain: CHAIN,
            });
            if (result.error) throw new Error(result.error.message);

            artifacts.push({
                name: "simulation-result",
                description: "Tenderly simulation result",
                parts: [{
                    type: "data",
                    data: result.data as unknown as Record<string, unknown>,
                }],
            });
        }

        // ── List transactions ───────────────────────────────────────
        else if (/list|history|recent|transactions/i.test(userText)) {
            const result = await sdk.agents.listTransactions(AGENT_ID!);
            if (result.error) throw new Error(result.error.message);

            const txs = (result.data as any)?.transactions ?? [];
            artifacts.push({
                name: "transaction-history",
                description: `${txs.length} recent transaction(s)`,
                parts: [{
                    type: "data",
                    data: {
                        count: txs.length,
                        transactions: txs.slice(0, 10).map((tx: any) => ({
                            tx_hash: tx.tx_hash,
                            status: tx.status,
                            to: tx.to,
                            value_wei: tx.value_wei,
                            chain: tx.chain,
                            created_at: tx.created_at,
                        })),
                    },
                }],
            });
        }

        // ── Signer info ─────────────────────────────────────────────
        else if (/info|signer|address|guardrail|config/i.test(userText)) {
            const agentResp = await sdk.agents.get(AGENT_ID!);
            if (agentResp.error) throw new Error(agentResp.error.message);
            const agent = agentResp.data as any;

            artifacts.push({
                name: "signer-info",
                description: "Agent signer configuration and guardrails",
                parts: [{
                    type: "data",
                    data: {
                        agent_id: agent.id,
                        name: agent.name,
                        signer_address: SIGNER_ADDRESS ?? "auto-resolved",
                        chain: CHAIN,
                        intents_api_enabled: agent.intents_api_enabled,
                        shroud_enabled: agent.shroud_enabled,
                        guardrails: {
                            tx_allowed_chains: agent.tx_allowed_chains,
                            tx_max_value_eth: agent.tx_max_value_eth,
                            tx_daily_limit_eth: agent.tx_daily_limit_eth,
                            tx_to_allowlist: agent.tx_to_allowlist,
                        },
                    },
                }],
            });
        }

        // ── Unknown ─────────────────────────────────────────────────
        else {
            artifacts.push({
                name: "help",
                parts: [{
                    type: "text",
                    text: [
                        "Available commands:",
                        "- Sign a transfer of 0.001 ETH to 0x...",
                        "- Send 0.001 ETH to 0x...",
                        "- Simulate sending 0.01 ETH to 0x...",
                        "- List recent transactions",
                        "- Show signer info",
                    ].join("\n"),
                }],
            });
        }

        task.status = {
            state: "completed",
            message: {
                role: "agent",
                parts: [{
                    type: "text",
                    text: `Task completed with ${artifacts.length} artifact(s).`,
                }],
            },
            timestamp: new Date().toISOString(),
        };
        task.artifacts = artifacts;
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[intents-worker] Error: ${errMsg}`);
        task.status = {
            state: "failed",
            message: {
                role: "agent",
                parts: [{ type: "text", text: `Error: ${errMsg}` }],
            },
            timestamp: new Date().toISOString(),
        };
    }

    const response: SendTaskResponse = {
        jsonrpc: "2.0",
        id: rpc.id,
        result: task,
    };
    res.json(response);
});

// ── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`[intents-worker] 1Claw Intents Worker listening on port ${PORT}`);
    console.log(`[intents-worker] Chain: ${CHAIN}`);
    console.log(`[intents-worker] Signer: ${SIGNER_ADDRESS ?? "auto-resolved from agent signing keys"}`);
    console.log(`[intents-worker] Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
});
