import { NextResponse } from "next/server";
import { initAgents } from "@/lib/agents";

export async function POST() {
    try {
        const meta = await initAgents();
        return NextResponse.json({
            ok: true,
            agents: { alice: meta.alice, bob: meta.bob },
            provisionedWithMasterKey: meta.provisionedWithMasterKey ?? false,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Setup failed";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
