/**
 * Shroud LLM client for AI-driven agent conversations.
 *
 * Calls the 1Claw Shroud proxy at /v1/chat/completions with the configured
 * provider and model. Each agent uses its own `X-Shroud-Agent-Key` (`agent_id:api_key`).
 *
 * - **LLM token billing (org Stripe AI Gateway):** omit `LLM_API_KEY`; agents should have
 *   `shroud_enabled` and the org should have LLM token billing — Shroud routes using the agent JWT.
 * - **BYOK:** set `LLM_API_KEY` to pass a provider key as `X-Shroud-Api-Key` (direct upstream).
 */

const SHROUD_URL = process.env.SHROUD_URL || "https://shroud.1claw.xyz";
const LLM_PROVIDER = process.env.LLM_PROVIDER || "google";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
/** Overrides the default model for the chosen provider (e.g. `gemini-2.5-flash`). */
const LLM_MODEL = process.env.LLM_MODEL?.trim() || "";
/** Completion length; low values truncate mid-sentence (default 512). */
const LLM_MAX_TOKENS = Math.min(
    4096,
    Math.max(64, Number.parseInt(process.env.LLM_MAX_TOKENS || "512", 10) || 512),
);

const DEFAULT_MODELS: Record<string, string> = {
    google: "gemini-2.5-flash",
    openai: "gpt-4.1-nano",
    anthropic: "claude-3-5-haiku-latest",
    mistral: "mistral-small-latest",
    openrouter: "meta-llama/llama-4-scout",
};

const SYSTEM_PROMPTS: Record<string, string> = {
    Alice: `You are Alice, a curious AI agent exploring cryptography and decentralized systems. You ask thoughtful questions about encryption, blockchain, privacy, and the Logos network. Keep messages conversational and brief (1-3 short paragraphs max). Finish each reply with complete sentences — never stop mid-word or mid-sentence. You're chatting with your friend Bob over an end-to-end encrypted channel.`,
    Bob: `You are Bob, a knowledgeable AI agent who explains crypto and decentralized systems clearly. You answer questions and occasionally ask Alice thought-provoking follow-ups. Keep messages conversational and brief (1-3 short paragraphs max). Finish each reply with complete sentences — never stop mid-word or mid-sentence. You're chatting with your friend Alice over an end-to-end encrypted channel.`,
};

export interface ConversationMessage {
    role: "user" | "assistant";
    content: string;
}

/**
 * Shroud expects `X-Shroud-Agent-Key` as `agent_id:api_key` (see shroud `parse_agent_key`).
 */
function getShroudAgentKeyHeader(agentName: string): string | null {
    if (agentName === "Alice") {
        const id = process.env.ONECLAW_ALICE_AGENT_ID?.trim();
        const key = process.env.ONECLAW_ALICE_API_KEY?.trim();
        if (id && key) return `${id}:${key}`;
    } else {
        const id = process.env.ONECLAW_BOB_AGENT_ID?.trim();
        const key = process.env.ONECLAW_BOB_API_KEY?.trim();
        if (id && key) return `${id}:${key}`;
    }
    return null;
}

export async function generateMessage(
    agentName: string,
    history: ConversationMessage[],
): Promise<string> {
    const agentKeyHeader = getShroudAgentKeyHeader(agentName);
    if (!agentKeyHeader) {
        throw new Error(
            "Missing 1Claw agent credentials for Shroud — set ONECLAW_*_AGENT_ID and ONECLAW_*_API_KEY (after bootstrap or provisioning)",
        );
    }
    const model = LLM_MODEL || DEFAULT_MODELS[LLM_PROVIDER] || "gemini-2.5-flash";

    const messages = [
        { role: "system" as const, content: SYSTEM_PROMPTS[agentName] || SYSTEM_PROMPTS.Alice },
        ...history.slice(-20),
    ];

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Shroud-Provider": LLM_PROVIDER,
        "X-Shroud-Agent-Key": agentKeyHeader,
    };

    if (LLM_API_KEY) {
        headers["X-Shroud-Api-Key"] = LLM_API_KEY;
    }

    const resp = await fetch(`${SHROUD_URL}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            messages,
            max_tokens: LLM_MAX_TOKENS,
            temperature: 0.8,
        }),
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Shroud LLM error (${resp.status}): ${text}`);
    }

    const data = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || "...";
}

/**
 * True when this agent can call Shroud: Alice/Bob id+api key in env.
 * Optional `LLM_API_KEY` enables BYOK; without it, org LLM token billing applies when configured.
 */
export function isLlmConfiguredForAgent(agentName: "Alice" | "Bob"): boolean {
    return Boolean(getShroudAgentKeyHeader(agentName));
}
