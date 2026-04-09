import { NextRequest, NextResponse } from "next/server";
import { encryptMessage, initAgents, type AgentName } from "@/lib/agents";
import { generateMessage, isLlmConfiguredForAgent, type ConversationMessage } from "@/lib/shroud";

export async function POST(req: NextRequest) {
    try {
        await initAgents();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to initialize agents";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    const body = (await req.json()) as { agent?: string; history?: ConversationMessage[] };
    const agentName = body.agent as AgentName;
    const history = body.history ?? [];

    if (!agentName || (agentName !== "Alice" && agentName !== "Bob")) {
        return NextResponse.json(
            { ok: false, error: 'Invalid request: need { agent: "Alice"|"Bob" }' },
            { status: 400 },
        );
    }

    if (!isLlmConfiguredForAgent(agentName)) {
        return NextResponse.json(
            {
                ok: false,
                error:
                    "LLM not configured — set ONECLAW_*_AGENT_ID and ONECLAW_*_API_KEY for both agents (npm run bootstrap). Optional LLM_API_KEY for BYOK; omit it to use org LLM token billing via Shroud when enabled.",
            },
            { status: 400 },
        );
    }

    try {
        const text = await generateMessage(agentName, history);
        const entry = encryptMessage(agentName, text);
        return NextResponse.json({ ok: true, message: entry });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "AI generation failed";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
