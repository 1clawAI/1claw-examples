#!/usr/bin/env node
// A paywall that asks for money and can be run in two seconds.
//
// Serves a real x402 challenge so `1claw pay` exercises the whole flow —
// challenge parsing, digest binding, the paid retry — without a funded agent, a
// chain, or a facilitator. It verifies that an X-PAYMENT header is *present*,
// not that it is valid: checking a signature would need a chain, and the point
// here is the flow around the payment rather than the settlement of it.
//
//   node paywall.mjs            # :4022
//   PORT=5000 node paywall.mjs
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4022);

// Deliberately short-ish, but not so short that a human cannot authorize in
// time. Set WINDOW_SECS=5 to watch the refetch loop give up after two cycles.
const WINDOW_SECS = Number(process.env.WINDOW_SECS ?? 120);
const PAY_TO = process.env.PAY_TO ?? "0x2B62000000000000000000000000000000008Abc";

const challenge = () => ({
    x402Version: 1,
    accepts: [
        {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "1000", // 0.001 USDC, 6 decimals
            payTo: PAY_TO,
            // Real x402 challenges name the asset by contract address, not by
            // symbol. This said "USDC" and that was wrong about the protocol —
            // the vault refused every genuine paywall while this mock passed.
            asset: process.env.ASSET ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            maxTimeoutSeconds: WINDOW_SECS,
            resource: "/premium",
        },
    ],
});

const server = createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
    }

    if (!req.url?.startsWith("/premium")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "try /premium" }));
    }

    const payment = req.headers["x-payment"];
    if (!payment) {
        const body = JSON.stringify(challenge());
        res.writeHead(402, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        });
        console.log(`  402 ${req.method} ${req.url} — asked for 0.001 USDC`);
        return res.end(body);
    }

    console.log(`  200 ${req.method} ${req.url} — paid (header ${String(payment).slice(0, 24)}…)`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ secret: "the answer is 42", paid: true }));
});

server.listen(PORT, () => {
    console.log(`mock x402 paywall on http://localhost:${PORT}/premium`);
    console.log(`  window ${WINDOW_SECS}s · payTo ${PAY_TO}`);
});
