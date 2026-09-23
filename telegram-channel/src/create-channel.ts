/**
 * Register a Telegram bot as a 1Claw channel.
 *
 * 1Claw validates the bot token against Telegram's own API (getMe) before
 * saving anything, then auto-registers the webhook with Telegram directly
 * (setWebhook) — there is no dashboard to click into on Telegram's side and
 * no webhook URL to copy-paste. One API call, and the bot is live.
 *
 * Prereqs: message @BotFather on Telegram, /newbot, copy the token it gives
 * you into .env as TELEGRAM_BOT_TOKEN.
 */
import { getClient } from "./client.js";

const agentId = process.env.ONECLAW_AGENT_ID!;
const botToken = process.env.TELEGRAM_BOT_TOKEN!;

async function main() {
  const client = await getClient();
  const res = await client.channels.create(agentId, {
    channel_type: "telegram",
    channel_name: "Support bot",
    config: { bot_token: botToken },
  });

  // The current SDK release doesn't expose auto_respond_enabled on create
  // (a real API field missing from CreateChannelRequest's type — check it
  // after creating and adjust with client.channels.update if needed).

  if (res.error) {
    // A wrong/missing bot_token is rejected here, before anything is saved —
    // 1Claw calls Telegram's getMe as part of validation, so this is a real
    // "is this actually a live bot" check, not just a shape check.
    console.error("Failed to create channel:", res.error.message);
    process.exit(1);
  }

  const channel = res.data!;
  console.log("Channel created:", channel.id);
  console.log("Bot username:", channel.metadata?.bot_username ?? "(unknown)");
  console.log("Webhook registered with Telegram:", channel.metadata?.webhook_registered ?? false);
  console.log("\nMessage the bot on Telegram now — 1Claw routes inbound");
  console.log("messages straight to this agent. Save this channel id for");
  console.log("send-message.ts / list-messages.ts:");
  console.log(`  ONECLAW_CHANNEL_ID=${channel.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
