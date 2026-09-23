/**
 * Run one real LLM request through Shroud → OpenAI or Gemini.
 * Set OPENAI_API_KEY for OpenAI, or GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY for Gemini.
 * (Or store the key in Vault at providers/openai/api-key or providers/google/api-key with agent read access.)
 */
import "./load-env.js";

const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.co").trim().replace(/\/$/, "");
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim();

function getAgentCreds(): { agentId: string; apiKey: string } | null {
  const id = (process.env.ONECLAW_AGENT_ID ?? "").trim();
  const key = (process.env.ONECLAW_AGENT_API_KEY ?? "").trim();
  if (!id || !key || id === "your-agent-uuid" || key.startsWith("ocv_your_")) return null;
  return { agentId: id, apiKey: key };
}

async function main() {
  const creds = getAgentCreds();
  if (!creds) {
    console.error("Set ONECLAW_AGENT_ID and ONECLAW_AGENT_API_KEY in .env");
    process.exit(1);
  }

  const useGemini = !!GEMINI_API_KEY;
  const provider = useGemini ? "google" : "openai";
  const model = useGemini ? "gemini-2.5-flash" : "gpt-4o-mini";

  const headers: Record<string, string> = {
    "X-Shroud-Agent-Key": `${creds.agentId}:${creds.apiKey}`,
    "Content-Type": "application/json",
    "X-Shroud-Provider": provider,
    "X-Shroud-Model": model,
  };
  if (OPENAI_API_KEY) headers["X-Shroud-Api-Key"] = OPENAI_API_KEY;
  if (GEMINI_API_KEY) headers["X-Shroud-Api-Key"] = GEMINI_API_KEY;

  let body: string;
  let path: string;
  let parseReply: (data: unknown) => string;

  if (useGemini) {
    path = `/v1beta/models/${model}:generateContent`;
    body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply in one short sentence: what is 2+2?" }] }],
      generationConfig: { maxOutputTokens: 50 },
    });
    parseReply = (data: unknown) => {
      const d = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    };
  } else {
    path = "/v1/chat/completions";
    body = JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply in one short sentence: what is 2+2?" }],
      max_tokens: 50,
    });
    parseReply = (data: unknown) => {
      const d = data as { choices?: Array<{ message?: { content?: string } }> };
      return d.choices?.[0]?.message?.content?.trim() ?? "";
    };
  }

  console.log(`Sending real LLM request via Shroud → ${useGemini ? "Gemini" : "OpenAI"}...\n`);
  const res = await fetch(`${SHROUD_URL}${path}`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Request failed:", res.status, text.slice(0, 300));
    if (res.status === 401) {
      console.error(
        "\nTip: Ensure Shroud can reach the Vault. Set OPENAI_API_KEY or GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) in .env, or store key in Vault at providers/openai/api-key or providers/google/api-key."
      );
    }
    process.exit(1);
  }

  const data = JSON.parse(text);
  const content = parseReply(data);
  console.log("Model reply:", content);
  console.log("\nReal LLM query succeeded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
