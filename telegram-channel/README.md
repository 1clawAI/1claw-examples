# 1Claw SDK — Telegram Channel Example

> **Reference only** — not for production use. Review and adapt for your own security requirements.

TypeScript scripts demonstrating 1Claw's Channels API: register a Telegram
bot, send an outbound message, and read message history — an agent talking
to real users on a real messaging platform, not just an API sandbox.

Telegram is used here because it's the fastest channel to actually try:
[@BotFather](https://t.me/BotFather) issues a bot token instantly, no app
review. The same API also supports Discord and WhatsApp (see
`vault/src/api/handlers/channels.rs` for the full set) — the shape is the
same, only `config` differs per channel type.

## Quick start

```bash
cd examples/telegram-channel
npm install
cp .env.example .env
```

1. Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`,
   copy the token it gives you into `.env` as `TELEGRAM_BOT_TOKEN`.
2. Set `ONECLAW_API_KEY` and `ONECLAW_AGENT_ID` (see `examples/basic` for
   creating an agent).
3. `npm run create`

## What you'll learn

- **One API call registers the bot end to end.** 1Claw validates the token
  against Telegram's own `getMe` before saving anything, then calls
  Telegram's `setWebhook` directly — there is no webhook URL to copy into a
  dashboard on Telegram's side.
- **Messages route through 1Claw's API**, not Telegram's SDK — `send-message.ts`
  and `list-messages.ts` show outbound send and inbound/outbound history via
  `client.channels.*`, so the same code works whether the underlying channel
  is Telegram, Discord, or WhatsApp.
- **Inbound messages reach the agent automatically** once the channel exists
  — message the bot on Telegram, then run `npm run messages` to see it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run create` | Register the bot as a channel (`client.channels.create`) |
| `npm run send` | Send an outbound message to a chat (`client.channels.sendMessage`) |
| `npm run messages` | List message history for the channel (`client.channels.listMessages`) |

## Known SDK gaps hit while building this

Found and worked around while writing this example, not something to
silently paper over:

- **`createClient({ apiKey })` races its own auth exchange for user (`1ck_`)
  keys.** `packages/sdk/src/core/client.ts`'s `autoAuthenticateUserKey` fires
  the key→JWT exchange asynchronously in the constructor without awaiting
  it — a request made right after construction can lose that race and fail
  with `"No credential was sent"`. `src/client.ts` here exchanges the key
  itself first and constructs the client with `token` instead, sidestepping
  it. Reported for a real SDK fix; every script in this example uses the
  workaround so it runs reliably regardless.
- **`CreateChannelRequest` doesn't expose `auto_respond_enabled`** even
  though the real API accepts it on create (`vault/src/api/dto/channels.rs`).
  Set it after creating via `client.channels.update(...)` instead.
- **`ChannelResponse` is missing several real response fields** the API
  actually returns: `warning`, `last_inbound_at`, `last_outbound_at`,
  `last_auto_respond_error`, `last_auto_respond_backend`, `webhook_status`.
  None of them are load-bearing for this example, so they're just omitted
  here rather than worked around.
