import { google } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { z } from "zod";
import { createPublicClient, http, parseUnits, encodeFunctionData, isAddress } from "viem";
import { normalize } from "viem/ens";
import { mainnet, base } from "viem/chains";
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
  optimism: "https://mainnet.optimism.io",
  arbitrum: "https://arb1.arbitrum.io/rpc",
};

const CHAIN_EXPLORER: Record<string, string> = {
  base: "https://basescan.org",
  ethereum: "https://etherscan.io",
  sepolia: "https://sepolia.etherscan.io",
  "base-sepolia": "https://sepolia.basescan.org",
  optimism: "https://optimistic.etherscan.io",
  arbitrum: "https://arbiscan.io",
};

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const KNOWN_TOKENS: Record<string, Record<string, { address: `0x${string}`; decimals: number }>> = {
  base: {
    usdc: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    dai: { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
    weth: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    usdt: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
  },
  ethereum: {
    usdc: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    dai: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    weth: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  },
};

const ethClient = createPublicClient({ chain: mainnet, transport: http(CHAIN_RPC.ethereum) });
const baseClient = createPublicClient({ chain: base, transport: http(CHAIN_RPC.base) });

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: `You are a demo AI agent showcasing 1Claw's Intents API with guardrails.

You have a crypto wallet managed through 1Claw. Your signing keys are stored in an HSM-backed vault — you never see the private key. Instead, you submit transaction intents and 1Claw signs them server-side.

Your wallet is protected by transaction guardrails configured by the wallet owner. These restrict which chains, addresses, and amounts you can transact on. If you violate a guardrail, the transaction is rejected before signing.

IMPORTANT CAPABILITIES:
- You can resolve ENS names (like vitalik.eth) to 0x addresses using the resolve_ens tool. ALWAYS resolve ENS names before attempting a transaction.
- You can send ERC-20 tokens (USDC, USDT, DAI, WETH) by encoding the transfer calldata with the encode_token_transfer tool. Use the returned calldata in the "data" field of submit_transaction with value "0" (token transfers don't send ETH).
- For ETH transfers, use submit_transaction directly with value in ETH.

When the user asks you to send a transaction:
1. If the address is an ENS name (ends in .eth), resolve it first with resolve_ens
2. Check your guardrails to understand your restrictions
3. For token transfers (USDC, etc.), use encode_token_transfer first to get the calldata, then submit with value="0" and the token contract as the "to" address
4. Try the transaction — if it's blocked, explain which guardrail caught it and why that's a good security feature
5. For valid transactions, submit them and share the result with the explorer link

When you run a simulation (simulate_transaction), the tool returns a Tenderly dashboard URL. Tell the user they can open "View simulation in Tenderly" in the result card to see the full trace, gas, and revert reason. For simulations that revert (e.g. insufficient balance), the Tenderly link is especially useful to inspect why.

Be conversational, helpful, and emphasize the security story. When guardrails block a transaction, frame it positively — "the guardrails protected the wallet from a potentially dangerous transaction."

Keep responses concise. Use the tools proactively.`,
    messages,
    maxSteps: 8,
    tools: {
      resolve_ens: tool({
        description:
          "Resolve an ENS name (like vitalik.eth) to an Ethereum 0x address. Always use this before sending to an ENS name.",
        parameters: z.object({
          name: z.string().describe("ENS name to resolve (e.g. 'vitalik.eth')"),
        }),
        execute: async ({ name }) => {
          try {
            const normalized = normalize(name);
            const address = await ethClient.getEnsAddress({ name: normalized });
            if (!address) {
              return { status: "error", error: `Could not resolve ENS name: ${name}` };
            }
            return { status: "ok", ens_name: name, address };
          } catch (e) {
            return { status: "error", error: `ENS resolution failed: ${String(e)}` };
          }
        },
      }),

      encode_token_transfer: tool({
        description:
          "Encode ERC-20 token transfer calldata. Returns the token contract address and hex calldata to use in submit_transaction. Supported tokens: USDC, USDT, DAI, WETH on base and ethereum.",
        parameters: z.object({
          token: z.string().describe("Token symbol (e.g. 'USDC', 'DAI')"),
          to: z.string().describe("Recipient address (0x-prefixed)"),
          amount: z.string().describe("Amount in human-readable units (e.g. '10' for 10 USDC)"),
          chain: z.string().default("base").describe("Chain name"),
        }),
        execute: async ({ token, to, amount, chain }) => {
          const tokenKey = token.toLowerCase();
          const chainTokens = KNOWN_TOKENS[chain];
          if (!chainTokens) {
            return { status: "error", error: `No token registry for chain: ${chain}. Supported chains: ${Object.keys(KNOWN_TOKENS).join(", ")}` };
          }
          const tokenInfo = chainTokens[tokenKey];
          if (!tokenInfo) {
            return { status: "error", error: `Unknown token: ${token} on ${chain}. Supported: ${Object.keys(chainTokens).join(", ")}` };
          }
          if (!isAddress(to)) {
            return { status: "error", error: `Invalid recipient address: ${to}. Must be a 0x-prefixed address.` };
          }
          try {
            const amountWei = parseUnits(amount, tokenInfo.decimals);
            const data = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "transfer",
              args: [to as `0x${string}`, amountWei],
            });
            return {
              status: "ok",
              token_contract: tokenInfo.address,
              token_symbol: token.toUpperCase(),
              decimals: tokenInfo.decimals,
              recipient: to,
              amount,
              calldata: data,
              instructions: `To execute this token transfer, call submit_transaction with: to="${tokenInfo.address}", value="0", chain="${chain}", data="${data}"`,
            };
          } catch (e) {
            return { status: "error", error: `Failed to encode transfer: ${String(e)}` };
          }
        },
      }),

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
                intents_api_enabled: info.intents_api_enabled,
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
          value: z.string().describe("Value in ETH (e.g. '0.001'), use '0' for token transfers"),
          chain: z.string().describe("Chain name (e.g. 'base', 'ethereum')"),
          data: z.string().optional().describe("Hex calldata for contract calls (e.g. ERC-20 transfers)"),
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
                revert_reason: sim.revert_reason,
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
          "Submit a real transaction to be signed and broadcast on-chain. For token transfers, set value='0' and include the ERC-20 calldata in the 'data' field. Use simulate_transaction first when possible.",
        parameters: z.object({
          to: z.string().describe("Destination address (or token contract for token transfers)"),
          value: z.string().describe("Value in ETH ('0' for token transfers)"),
          chain: z.string().describe("Chain name"),
          data: z.string().optional().describe("Hex calldata (required for token transfers)"),
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
                tenderly_dashboard_url: tx.tenderly_dashboard_url,
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
