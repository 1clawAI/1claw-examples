import { sendToShroud, printResult } from "./utils.js";
import "dotenv/config";

export async function testUnicode(
  shroudUrl: string,
  token: string,
  openaiKey?: string
): Promise<void> {
  console.log("── Unicode Normalization Tests ──\n");

  // Test 1: Cyrillic homoglyphs (а, е, о, р, с, х look like Latin letters)
  const homoglyphInput = "Please dеlеtе the file";  // 'е' is Cyrillic U+0435
  const resp1 = await sendToShroud(shroudUrl, token, homoglyphInput, openaiKey);
  
  printResult(
    "Homoglyphs",
    homoglyphInput,
    resp1.inspection?.unicode_normalized
      ? "Normalized (Cyrillic е → Latin e)"
      : resp1.error?.message || "Passed through",
    !!resp1.inspection?.unicode_normalized
  );

  // Test 2: Zero-width characters
  const zeroWidthInput = "safe\u200Bcommand\u200Chere";  // U+200B (ZWSP), U+200C (ZWNJ)
  const resp2 = await sendToShroud(shroudUrl, token, zeroWidthInput, openaiKey);
  
  printResult(
    "Zero-Width Characters",
    "safe[ZWSP]command[ZWNJ]here",
    resp2.inspection?.unicode_normalized
      ? "Stripped zero-width characters"
      : resp2.error?.message || "Passed through",
    !!resp2.inspection?.unicode_normalized
  );

  // Test 3: Clean text (should pass through unchanged)
  const cleanInput = "What is the weather today?";
  const resp3 = await sendToShroud(shroudUrl, token, cleanInput, openaiKey);
  
  printResult(
    "Clean Text",
    cleanInput,
    resp3.inspection?.unicode_normalized
      ? "Normalized (unexpected)"
      : "Passed through unchanged",
    false
  );
}

// Run standalone
if (process.argv[1]?.includes("test-unicode")) {
  const shroudUrl = process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.xyz";
  const apiUrl = process.env.ONECLAW_API_URL || "https://api.1claw.xyz";
  const agentId = process.env.ONECLAW_AGENT_ID;
  const agentApiKey = process.env.ONECLAW_AGENT_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!agentId || !agentApiKey) {
    console.error("Missing agent credentials");
    process.exit(1);
  }

  fetch(`${apiUrl}/v1/auth/agent-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, api_key: agentApiKey }),
  })
    .then((r) => r.json())
    .then((d) => testUnicode(shroudUrl, d.access_token, openaiKey))
    .catch(console.error);
}
