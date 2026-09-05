import { NextResponse } from "next/server";
import { createClient } from "@1claw/sdk";
import { SIGNING_KEY_CHAINS } from "@/lib/chains";

export async function POST() {
  const apiKey = process.env.ONECLAW_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Set ONECLAW_API_KEY in .env.local, or run npm run bootstrap from the terminal.",
      },
      { status: 400 },
    );
  }

  const baseUrl = process.env.ONECLAW_BASE_URL || "https://api.1claw.co";
  const client = createClient({ baseUrl, apiKey });

  const auth = await client.auth.apiKeyToken({ api_key: apiKey });
  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: 401 });
  }

  let agentId = process.env.ONECLAW_AGENT_ID?.trim();
  let agentApiKey = process.env.ONECLAW_AGENT_API_KEY?.trim();
  let created = false;

  if (!agentId || !agentApiKey) {
    const res = await client.agents.create({
      name: `multichain-demo-${Date.now().toString(36)}`,
      description: "Multichain agent demo",
      intents_api_enabled: true,
    });
    if (res.error || !res.data?.agent || !res.data.api_key) {
      return NextResponse.json(
        { error: res.error?.message ?? "Agent create failed" },
        { status: 500 },
      );
    }
    agentId = res.data.agent.id;
    agentApiKey = res.data.api_key;
    created = true;
  }

  const keysRes = await client.signingKeys.list(agentId);
  const existing = new Set(
    (keysRes.data?.keys ?? []).filter((k) => k.is_active).map((k) => k.chain),
  );

  const provisioned: Array<{ chain: string; address?: string; status: string }> = [];
  for (const chain of SIGNING_KEY_CHAINS) {
    if (existing.has(chain)) {
      const row = keysRes.data?.keys.find((k) => k.chain === chain && k.is_active);
      provisioned.push({ chain, address: row?.address, status: "existing" });
      continue;
    }
    const res = await client.signingKeys.create(agentId, { chain });
    provisioned.push({
      chain,
      address: res.data?.address,
      status: res.error ? "error" : "created",
    });
  }

  return NextResponse.json({
    agent_id: agentId,
    agent_api_key: agentApiKey,
    agent_created: created,
    keys: provisioned,
    note: "Copy agent_id and agent_api_key into .env.local, then restart npm run dev.",
  });
}
