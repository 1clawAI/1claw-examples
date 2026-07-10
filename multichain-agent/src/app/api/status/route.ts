import { NextResponse } from "next/server";
import { isAgentConfigured, getAgentId } from "@/lib/oneclaw";

export async function GET() {
  return NextResponse.json({
    agent_configured: isAgentConfigured(),
    agent_id: isAgentConfigured() ? getAgentId() : null,
    human_key_set: Boolean(process.env.ONECLAW_API_KEY),
    gemini_set: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
  });
}
