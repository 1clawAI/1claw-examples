const API_URL = process.env.ONECLAW_API_URL || "https://api.1claw.xyz";
const AGENT_ID = process.env.ONECLAW_AGENT_ID!;
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY!;

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${API_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: AGENT_ID, api_key: AGENT_API_KEY }),
  });

  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 120) * 1000;
  return cachedToken!;
}

async function apiCall<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data.detail || data.message || `API error ${res.status}`,
    );
  }

  return data as T;
}

export function getAgentId() {
  return AGENT_ID;
}

interface AgentInfo {
  id: string;
  name: string;
  crypto_proxy_enabled: boolean;
  tx_to_allowlist?: string[];
  tx_max_value_eth?: string;
  tx_daily_limit_eth?: string;
  tx_allowed_chains?: string[];
}

export async function getAgentInfo(): Promise<AgentInfo> {
  return apiCall("GET", `/v1/agents/${AGENT_ID}`);
}

interface SimulationResult {
  simulation_id: string;
  status: "success" | "reverted" | "error";
  gas_used: number;
  gas_estimate_usd?: string;
  balance_changes: Array<{
    address: string;
    token?: string;
    before?: string;
    after?: string;
    change?: string;
  }>;
  error?: string;
  revert_reason?: string;
  tenderly_dashboard_url?: string;
}

export async function simulateTransaction(params: {
  to: string;
  value: string;
  chain: string;
  data?: string;
}): Promise<SimulationResult> {
  return apiCall(
    "POST",
    `/v1/agents/${AGENT_ID}/transactions/simulate`,
    params,
  );
}

interface TransactionResult {
  id: string;
  agent_id: string;
  chain: string;
  chain_id: number;
  to: string;
  value_wei: string;
  status: string;
  signed_tx?: string;
  tx_hash?: string;
  error_message?: string;
  created_at: string;
  signed_at?: string;
  simulation_status?: string;
  /** When the tx was run with simulate_first, URL to view the simulation in Tenderly. */
  tenderly_dashboard_url?: string;
}

export async function submitTransaction(params: {
  to: string;
  value: string;
  chain: string;
  data?: string;
  simulate_first?: boolean;
}): Promise<TransactionResult> {
  return apiCall(
    "POST",
    `/v1/agents/${AGENT_ID}/transactions`,
    params,
  );
}

export async function listTransactions(): Promise<{
  transactions: TransactionResult[];
}> {
  return apiCall("GET", `/v1/agents/${AGENT_ID}/transactions`);
}

export async function getBalance(
  address: string,
  rpcUrl: string,
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getBalance",
      params: [address, "latest"],
      id: 1,
    }),
  });
  const data = await res.json();
  const wei = BigInt(data.result);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(8);
}
