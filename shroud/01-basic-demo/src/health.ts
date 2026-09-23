/**
 * Shroud health and TLS checks (no auth required).
 * GET /healthz, /health/ready, /health/live; verify TLS.
 */
import { fileURLToPath } from "node:url";
import "./load-env.js";

const SHROUD_URL = (process.env.ONECLAW_SHROUD_URL || "https://shroud.1claw.co").trim() || "https://shroud.1claw.co";

async function fetchStatus(
  label: string,
  url: string,
  acceptCodes: number[]
): Promise<{ ok: boolean; code?: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    const ok = acceptCodes.includes(res.status);
    return ok
      ? { ok: true, code: res.status }
      : { ok: false, code: res.status, error: await res.text().then((t) => t.slice(0, 80)) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runHealthChecks(): Promise<{ passed: number; failed: number }> {
  const base = SHROUD_URL.replace(/\/$/, "");
  let passed = 0;
  let failed = 0;

  console.log("── Shroud health checks ──");
  console.log("Shroud URL:", base);
  console.log("");

  const healthz = await fetchStatus("GET /healthz", `${base}/healthz`, [200, 401]);
  if (healthz.ok) {
    console.log("[OK]   GET /healthz →", healthz.code);
    passed++;
  } else {
    console.log("[FAIL] GET /healthz →", healthz.code ?? healthz.error);
    failed++;
  }

  const ready = await fetchStatus("GET /health/ready", `${base}/health/ready`, [200, 401, 503]);
  if (ready.ok) {
    console.log("[OK]   GET /health/ready →", ready.code);
    passed++;
  } else {
    console.log("[FAIL] GET /health/ready →", ready.code ?? ready.error);
    failed++;
  }

  const live = await fetchStatus("GET /health/live", `${base}/health/live`, [200, 401]);
  if (live.ok) {
    console.log("[OK]   GET /health/live →", live.code);
    passed++;
  } else {
    console.log("[FAIL] GET /health/live →", live.code ?? live.error);
    failed++;
  }

  return { passed, failed };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runHealthChecks()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
