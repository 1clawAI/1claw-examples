const API_URL = process.env.ONECLAW_BASE_URL || "https://api.1claw.co";

function requireAgentConfig() {
  const agentId = process.env.ONECLAW_AGENT_ID;
  const apiKey = process.env.ONECLAW_AGENT_API_KEY;
  if (!agentId || !apiKey) {
    throw new Error(
      "Agent not configured. Run npm run bootstrap and restart the dev server.",
    );
  }
  return { agentId, apiKey };
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getAgentToken(): Promise<string> {
  const { agentId, apiKey } = requireAgentConfig();
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${API_URL}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, api_key: apiKey }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Agent auth failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 120) * 1000;
  return cachedToken!;
}

export async function apiCall<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const bearer = token ?? (await getAgentToken());
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || `API ${res.status}`);
  }
  return data as T;
}

export function getAgentId(): string {
  return requireAgentConfig().agentId;
}

export function isAgentConfigured(): boolean {
  return Boolean(
    process.env.ONECLAW_AGENT_ID && process.env.ONECLAW_AGENT_API_KEY,
  );
}

export interface SigningKeyRow {
  chain: string;
  address?: string;
  public_key?: string;
  is_active?: boolean;
}

export async function listSigningKeys(): Promise<SigningKeyRow[]> {
  const agentId = getAgentId();
  const data = await apiCall<{ keys: SigningKeyRow[] }>(
    "GET",
    `/v1/agents/${agentId}/signing-keys`,
  );
  return data.keys ?? [];
}

export async function submitTransaction(body: Record<string, unknown>) {
  const agentId = getAgentId();
  return apiCall("POST", `/v1/agents/${agentId}/transactions`, body);
}

export async function signTransaction(body: Record<string, unknown>) {
  const agentId = getAgentId();
  return apiCall("POST", `/v1/agents/${agentId}/transactions/sign`, body);
}

export async function getSigningKeyBalance(chain: string, tokens?: string[]) {
  const agentId = getAgentId();
  const q = tokens?.length ? `?tokens=${tokens.join(",")}` : "";
  return apiCall(
    "GET",
    `/v1/agents/${agentId}/signing-keys/${chain}/balance${q}`,
  );
}

export async function getAgentInfo() {
  const agentId = getAgentId();
  return apiCall("GET", `/v1/agents/${agentId}`);
}

export async function listTransactions() {
  const agentId = getAgentId();
  return apiCall<{ transactions: Array<Record<string, unknown>> }>(
    "GET",
    `/v1/agents/${agentId}/transactions`,
  );
}

export { API_URL };
