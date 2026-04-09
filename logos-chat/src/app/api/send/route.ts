import { NextRequest, NextResponse } from "next/server";
import { encryptMessage, initAgents, type AgentName } from "@/lib/agents";

export async function POST(req: NextRequest) {
    try {
        await initAgents();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to initialize agents";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    const body = (await req.json()) as { from?: string; text?: string };
    const from = body.from as AgentName;
    const text = body.text;

    if (!from || !text || (from !== "Alice" && from !== "Bob")) {
        return NextResponse.json(
            { ok: false, error: 'Invalid request: need { from: "Alice"|"Bob", text: string }' },
            { status: 400 },
        );
    }

    try {
        const entry = encryptMessage(from, text);
        return NextResponse.json({ ok: true, message: entry });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Encryption failed";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
