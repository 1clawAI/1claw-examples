import { google } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { z } from "zod";
import {
  getAgentInfo,
  simulateTransaction,
  submitTransaction,
  listTransactions,
  getBalance,
} from "@/lib/oneclaw";

const CHAIN_RPC: Record<string, string> = {
  base: "https://mainnet.base.org",
  ethereum: "https://eth.llamarpc.com",
  sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
  "base-sepolia": "https://sepolia.base.org",
};

const CHAIN_EXPLORER: Record<string, string> = {
  base: "https://basescan.org",
  ethereum: "https://etherscan.io",
  sepolia: "https://sepolia.etherscan.io",
  "base-sepolia": "https://sepolia.basescan.org",
};

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: `You are a demo AI agent showcasing 1Claw's crypto transaction proxy with guardrails.

You have a crypto wallet managed through 1Claw. Your signing keys are stored in an HSM-backed vault — you never see the private key. Instead, you submit transaction intents and 1Claw signs them server-side.

Your wallet is protected by transaction guardrails configured by the wallet owner. These restrict which chains, addresses, and amounts you can transact on. If you violate a guardrail, the transaction is rejected before signing.

When the user asks you to send a transaction:
1. First check your guardrails to understand your restrictions
2. Try the transaction — if it's blocked, explain which guardrail caught it and why that's a good security feature
3. For valid transactions, submit them and share the result with the explorer link

Be conversational, helpful, and emphasize the security story. When guardrails block a transaction, frame it positively — "the guardrails protected the wallet from a potentially dangerous transaction."

Keep responses concise. Use the tools proactively.`,
    messages,
    maxSteps: 6,
    tools: {
      check_guardrails: tool({
        description:
          "Check the agent's current transaction guardrail configuration — allowed chains, addresses, value limits.",
        parameters: z.object({}),
        execute: async () => {
          try {
            const info = await getAgentInfo();
            return {
              status: "ok",
              guardrails: {
                crypto_proxy_enabled: info.crypto_proxy_enabled,
                allowed_chains: info.tx_allowed_chains ?? [],
                allowed_destinations: info.tx_to_allowlist ?? [],
                max_value_per_tx_eth: info.tx_max_value_eth ?? "unlimited",
                daily_spend_limit_eth: info.tx_daily_limit_eth ?? "unlimited",
              },
            };
          } catch (e) {
            return { status: "error", error: String(e) };
          }
        },
      }),

      simulate_transaction: tool({
        description:
          "Simulate a transaction via Tenderly without signing or broadcasting. Returns gas estimates, balance changes, and success/revert status.",
        parameters: z.object({
          to: z.string().describe("Destination address (0x-prefixed)"),
          value: z.string().describe("Value in ETH (e.g. '0.001')"),
          chain: z.string().describe("Chain name (e.g. 'base', 'ethereum')"),
          data: z.string().optional().describe("Hex calldata for contract calls"),
        }),
        execute: async ({ to, value, chain, data }) => {
          try {
            const sim = await simulateTransaction({ to, value, chain, data });
            return {
              status: "ok",
              simulation: {
                result: sim.status,
                gas_used: sim.gas_used,
                gas_cost_usd: sim.gas_estimate_usd,
                balance_changes: sim.balance_changes,
                error: sim.error || sim.revert_reason,
                tenderly_url: sim.tenderly_dashboard_url,
              },
            };
          } catch (e) {
            const msg = String(e);
            const blocked = msg.includes("403") || msg.includes("denied");
            return {
              status: blocked ? "blocked" : "error",
              reason: blocked ? "Guardrail violation — transaction rejected before simulation." : msg,
              chain,
              to,
              value,
            };
          }
        },
      }),

      submit_transaction: tool({
        description:
          "Submit a real transaction to be signed and broadcast on-chain. Use simulate_transaction first when possible.",
        parameters: z.object({
          to: z.string().describe("Destination address"),
          value: z.string().describe("Value in ETH"),
          chain: z.string().describe("Chain name"),
          data: z.string().optional().describe("Hex calldata"),
          simulate_first: z.boolean().default(false).describe("Run simulation before signing"),
        }),
        execute: async ({ to, value, chain, data, simulate_first }) => {
          try {
            const tx = await submitTransaction({
              to,
              value,
              chain,
              data,
              simulate_first,
            });
            const explorer = CHAIN_EXPLORER[chain] || CHAIN_EXPLORER.base;
            return {
              status: "ok",
              transaction: {
                id: tx.id,
                chain: tx.chain,
                chain_id: tx.chain_id,
                to: tx.to,
                value_wei: tx.value_wei,
                tx_status: tx.status,
                tx_hash: tx.tx_hash,
                explorer_url: tx.tx_hash ? `${explorer}/tx/${tx.tx_hash}` : undefined,
                simulation_status: tx.simulation_status,
                signed_at: tx.signed_at,
              },
            };
          } catch (e) {
            const msg = String(e);
            const blocked = msg.includes("403") || msg.includes("denied");
            return {
              status: blocked ? "blocked" : "error",
              reason: blocked
                ? "Transaction rejected by guardrails. The signing proxy refused to sign this transaction because it violates the agent's configured restrictions."
                : msg,
              chain,
              to,
              value,
            };
          }
        },
      }),

      check_balance: tool({
        description: "Check the ETH balance of an address on a given chain.",
        parameters: z.object({
          address: z.string().describe("Ethereum address to check"),
          chain: z.string().default("base").describe("Chain name"),
        }),
        execute: async ({ address, chain }) => {
          const rpc = CHAIN_RPC[chain];
          if (!rpc) return { status: "error", error: `Unknown chain: ${chain}` };
          try {
            const balance = await getBalance(address, rpc);
            return { status: "ok", address, chain, balance_eth: balance };
          } catch (e) {
            return { status: "error", error: String(e) };
          }
        },
      }),

      list_transactions: tool({
        description: "List recent transactions submitted by this agent.",
        parameters: z.object({}),
        execute: async () => {
          try {
            const data = await listTransactions();
            return {
              status: "ok",
              transactions: data.transactions.map((tx) => ({
                id: tx.id,
                chain: tx.chain,
                to: tx.to,
                value_wei: tx.value_wei,
                status: tx.status,
                tx_hash: tx.tx_hash,
                created_at: tx.created_at,
              })),
            };
          } catch (e) {
            return { status: "error", error: String(e) };
          }
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
