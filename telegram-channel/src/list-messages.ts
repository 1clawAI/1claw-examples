/**
 * List message history for a channel — both inbound (from Telegram users)
 * and outbound (sent via send-message.ts or the agent's own auto-responses).
 */
import { getClient } from "./client.js";

const agentId = process.env.ONECLAW_AGENT_ID!;
const channelId = process.env.ONECLAW_CHANNEL_ID!;

async function main() {
  const client = await getClient();
  const res = await client.channels.listMessages(agentId, channelId, 20);

  if (res.error) {
    console.error("Failed to list messages:", res.error.message);
    process.exit(1);
  }

  const messages = res.data?.messages ?? [];
  if (messages.length === 0) {
    console.log("No messages yet — send /start to your bot on Telegram, then re-run this.");
    return;
  }

  for (const m of messages) {
    console.log(`[${m.direction}] chat=${m.external_chat_id} ${m.content}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
