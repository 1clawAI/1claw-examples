/**
 * Optional debug wrapper for fetch — logs x402 request/response details
 * when X402_CLIENT_DEBUG=1 is set.
 */

export function isX402ClientDebugEnabled(): boolean {
    return process.env.X402_CLIENT_DEBUG === "1";
}

export function wrapX402DebugFetch(
    baseFetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
    if (!isX402ClientDebugEnabled()) return baseFetch;

    return async (input, init?) => {
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
        const method = init?.method ?? "GET";
        console.log(`[x402 debug] → ${method} ${url}`);

        if (init?.headers) {
            const h =
                init.headers instanceof Headers
                    ? Object.fromEntries(init.headers.entries())
                    : init.headers;
            console.log("[x402 debug]   headers:", JSON.stringify(h));
        }

        const res = await baseFetch(input, init);

        console.log(`[x402 debug] ← ${res.status} ${res.statusText}`);
        return res;
    };
}
