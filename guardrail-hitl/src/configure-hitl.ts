/**
 * Configure graduated HITL guardrails on an agent (v0.54–0.55).
 *
 * Usage: ONECLAW_API_KEY=1ck_... npx tsx src/configure-hitl.ts [agent-id]
 */

import { createClient } from "@1claw/sdk";

const API_KEY = process.env.ONECLAW_API_KEY;
const AGENT_ID = process.argv[2];

if (!API_KEY) {
  console.error("Set ONECLAW_API_KEY");
  process.exit(1);
}

const client = createClient({ apiKey: API_KEY });

const txApprovalPolicy = {
  require_above_native: { ethereum: "0.1", base: "0.05" },
  require_for_new_recipients: true,
  require_for_unlimited_approvals: true,
};

async function main() {
  if (AGENT_ID) {
    const res = await client.agents.update(AGENT_ID, {
      tx_approval_policy: txApprovalPolicy,
      typed_data_policy: "approve",
      simulation_failure_policy: "approve",
      tx_block_unlimited_approvals: true,
      raw_signing_policy: "approve",
    });
    if (res.error) {
      console.error(res.error.message);
      process.exit(1);
    }
    console.log("Updated agent:", res.data?.id, res.data?.name);
    console.log("tx_approval_policy:", JSON.stringify(res.data?.tx_approval_policy, null, 2));
    return;
  }

  const created = await client.agents.create({
    name: `hitl-demo-${Date.now()}`,
    intents_api_enabled: true,
    tx_approval_policy: txApprovalPolicy,
    typed_data_policy: "deny",
    simulation_failure_policy: "deny",
    tx_max_value: "0.5",
    tx_daily_limit: "2.0",
  });

  if (created.error) {
    console.error(created.error.message);
    process.exit(1);
  }

  console.log("Created agent:", created.data?.agent.id);
  if (created.data?.api_key) {
    console.log("API key (save now):", created.data.api_key);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
