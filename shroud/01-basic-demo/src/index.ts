/**
 * Shroud demo — run all feature checks: health, Intents API, optional LLM proxy.
 * Usage: npm start (or npm test)
 */
import "./load-env.js";
import { runHealthChecks } from "./health.js";
import { runIntentsChecks } from "./intents.js";
import { runLlmProxyCheck } from "./llm-proxy.js";

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  1Claw Shroud — feature checks");
  console.log("═══════════════════════════════════════════\n");

  const health = await runHealthChecks();
  console.log("");

  const intents = await runIntentsChecks();
  console.log("");

  const llm = await runLlmProxyCheck();
  console.log("");

  const totalPassed = health.passed + intents.passed + llm.passed;
  const totalFailed = health.failed + intents.failed + llm.failed;
  const totalSkipped = intents.skipped + llm.skipped;
  const total = totalPassed + totalFailed + totalSkipped;

  console.log("═══════════════════════════════════════════");
  console.log(
    `  Shroud: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped / ${total} total`
  );
  console.log("═══════════════════════════════════════════");

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
