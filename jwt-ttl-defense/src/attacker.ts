import { createClient } from "@1claw/sdk";
import { attacker, fail, note, ok, preview, warn } from "./pretty.js";

export type AttemptOutcome =
    | { kind: "success"; secretValue: string }
    | { kind: "forbidden"; status: number; message: string }
    | { kind: "expired"; status: number; message: string }
    | { kind: "other"; status?: number; message: string };

export interface AttackAttempt {
    label: string;
    path: string;
    delayMs: number;
    outcome: AttemptOutcome;
}

/**
 * A hostile process that has received the victim agent's JWT over the
 * exfil channel. It has no API key, no vault list, and no user context —
 * only whatever claims the JWT carries.
 *
 * We run three attempts back-to-back to make the blast-radius tangible:
 *   - fast + in-scope        → succeeds (narrow damage)
 *   - fast + out-of-scope    → 403 scope violation
 *   - slow                   → 401 JWT expired
 */
export async function runAttacker(
    baseUrl: string,
    leakedJwt: string,
    vaultId: string,
    secretPath: string,
    sensitivePath: string,
    slowDelaySeconds: number,
): Promise<AttackAttempt[]> {
    attacker(
        "Received leaked JWT from exfil channel",
        `token=${preview(leakedJwt)}`,
    );
    note(
        "Attacker has NO API key, NO session cookie, NO vault list — just this JWT.",
    );

    const attempts: AttackAttempt[] = [];

    // ── Attempt 1: fast + in-scope path ──────────────────────────
    await sleep(500);
    attacker(
        `Attempt 1 — fast + in-scope (${secretPath})`,
        "same path the victim used, racing the 3s TTL",
    );
    const a1 = await tryGet(baseUrl, leakedJwt, vaultId, secretPath);
    attempts.push({
        label: "fast + in-scope",
        path: secretPath,
        delayMs: 500,
        outcome: a1,
    });
    renderOutcome(a1);

    // ── Attempt 2: fast + out-of-scope path ──────────────────────
    attacker(
        `Attempt 2 — fast + out-of-scope (${sensitivePath})`,
        "same JWT, different path (treasury signer)",
    );
    const a2 = await tryGet(baseUrl, leakedJwt, vaultId, sensitivePath);
    attempts.push({
        label: "fast + out-of-scope",
        path: sensitivePath,
        delayMs: 0,
        outcome: a2,
    });
    renderOutcome(a2);

    // ── Attempt 3: slow — wait past the TTL ──────────────────────
    attacker(
        `Attempt 3 — slow (${slowDelaySeconds}s wait, past 3s TTL)`,
        "attacker pivots through a proxy, or just isn't fast enough",
    );
    await sleep(slowDelaySeconds * 1000);
    const a3 = await tryGet(baseUrl, leakedJwt, vaultId, secretPath);
    attempts.push({
        label: "slow",
        path: secretPath,
        delayMs: slowDelaySeconds * 1000,
        outcome: a3,
    });
    renderOutcome(a3);

    return attempts;
}

async function tryGet(
    baseUrl: string,
    jwt: string,
    vaultId: string,
    path: string,
): Promise<AttemptOutcome> {
    const client = createClient({ baseUrl, token: jwt });
    const res = await client.secrets.get(vaultId, path);
    const status = res.meta?.status;

    if (res.data?.value) {
        return { kind: "success", secretValue: res.data.value };
    }

    const message =
        res.error?.detail ?? res.error?.message ?? "request failed";

    // 402 appears when the JWT is expired/invalid: the 1Claw API's x402
    // payment middleware runs *outside* of auth, so an unauthenticated
    // request to a paid route gets "payment required" before it ever hits
    // the auth middleware. From the attacker's perspective it's still a
    // hard block on using the stolen JWT — label it as such.
    if (
        status === 401 ||
        status === 402 ||
        /expired|unauthorized|payment/i.test(message)
    ) {
        return { kind: "expired", status: status ?? 401, message };
    }
    if (status === 403 || /forbidden|scope|policy|not allowed/i.test(message)) {
        return { kind: "forbidden", status: status ?? 403, message };
    }
    return { kind: "other", status, message };
}

function renderOutcome(outcome: AttemptOutcome): void {
    switch (outcome.kind) {
        case "success":
            fail(
                "SECRET STOLEN",
                `value=${outcome.secretValue.slice(0, 4)}…${outcome.secretValue.slice(-2)} — this is the blast radius (1 secret, narrow scope)`,
            );
            return;
        case "forbidden":
            ok(
                `Blocked (${outcome.status} Forbidden)`,
                `scope/vault binding prevented lateral movement — ${outcome.message}`,
            );
            return;
        case "expired": {
            const statusLabel =
                outcome.status === 402
                    ? "402 Payment Required"
                    : outcome.status === 401
                    ? "401 Unauthorized"
                    : `${outcome.status} Blocked`;
            ok(
                `Blocked (${statusLabel})`,
                `JWT TTL expired — server treats the request as unauthenticated (${outcome.message})`,
            );
            return;
        }
        case "other":
            warn(
                `Unexpected response${outcome.status ? ` (${outcome.status})` : ""}`,
                outcome.message,
            );
            return;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
