/**
 * Send an outbound message through an already-registered Telegram channel.
 * Run create-channel.ts first and message the bot once so 1Claw has a real
 * chat id to reply into (or set TELEGRAM_CHAT_ID directly).
 */
import { getClient } from "./client.js";

const agentId = process.env.ONECLAW_AGENT_ID!;
const channelId = process.env.ONECLAW_CHANNEL_ID!;
const chatId = process.env.TELEGRAM_CHAT_ID!;

async function main() {
  const client = await getClient();
  const res = await client.channels.sendMessage(agentId, channelId, {
    external_chat_id: chatId,
    content: "Hello from 1Claw — this message was sent through the Channels API, not Telegram's SDK directly.",
  });

  if (res.error) {
    console.error("Failed to send:", res.error.message);
    process.exit(1);
  }

  console.log("Sent:", res.data?.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
