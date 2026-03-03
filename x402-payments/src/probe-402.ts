/**
 * Probe x402-capable endpoints — no payment key required.
 * Performs unauthenticated GETs to see 401/402 and prints status + 402 body when present.
 */

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";

const endpoints: { name: string; url: string }[] = [
    { name: "GET /v1/vaults/{id}/secrets/{path}", url: `${BASE_URL}/v1/vaults/00000000-0000-0000-0000-000000000000/secrets/test` },
    { name: "GET /v1/audit/events", url: `${BASE_URL}/v1/audit/events` },
    { name: "GET /v1/share/{id}", url: `${BASE_URL}/v1/share/00000000-0000-0000-0000-000000000000` },
];

console.log("=== 1Claw x402 probe (unauthenticated) ===\n");

for (const ep of endpoints) {
    process.stdout.write(`  ${ep.name} ... `);
    try {
        const res = await fetch(ep.url);
        console.log(res.status);
        if (res.status === 402) {
            const body = await res.json().catch(() => ({}));
            console.log("    402 body:", JSON.stringify(body).slice(0, 200));
        }
    } catch (e) {
        console.log("Error:", e instanceof Error ? e.message : String(e));
    }
}

console.log("\nDone. Expect 402 when payment required (no auth / over quota).");
