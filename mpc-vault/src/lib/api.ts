/**
 * Minimal REST helpers for MPC flows where the published SDK does not yet
 * surface optional fields (e.g. client_share on PUT) or headers (X-Client-Share on GET).
 */

const BASE = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.co";

export async function bearerFromApiKey(apiKey: string): Promise<string> {
    const res = await fetch(`${BASE.replace(/\/$/, "")}/v1/auth/api-key-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`api-key-token failed: HTTP ${res.status} ${text}`);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("api-key-token: missing access_token");
    return data.access_token;
}

export function apiBase(): string {
    return BASE.replace(/\/$/, "");
}

export async function apiJson<T>(
    method: string,
    path: string,
    token: string,
    opts?: { body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; json: T | null; text: string }> {
    const url = `${apiBase()}${path}`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
    };
    const init: RequestInit = { method, headers };
    if (opts?.body !== undefined) {
        init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let json: T | null = null;
    if (text) {
        try {
            json = JSON.parse(text) as T;
        } catch {
            /* leave json null */
        }
    }
    return { status: res.status, json, text };
}
