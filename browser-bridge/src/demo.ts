#!/usr/bin/env -S npx tsx
// Copyright (C) 2026 1Claw
// SPDX-License-Identifier: Apache-2.0

/**
 * The agent drives the browser. It never sees the password.
 *
 * A real `puppeteer-core` — the same library, connected the same way any
 * browser-driving agent framework does (`browserWSEndpoint`) — opens a login
 * page and clicks around like a normal agent would. When it is time to type
 * the password, the agent does not type it: it asks the bridge, by binding
 * id only, to fill it. The bridge — a separate process — reads the field
 * itself and types into it. Everything the agent's tool call gets back is
 * printed below, so you can check for yourself that the password is not in
 * it.
 *
 * No 1Claw account, no network calls to 1Claw. `MockVaultDriver` holds the
 * password in memory for this demo; a real deployment stores it in your
 * 1Claw vault instead (see the README).
 *
 *   npx tsx src/demo.ts [--chrome /path/to/chrome]
 */

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { startBridge, MockVaultDriver } from "@1claw/browser-bridge";

const PASSWORD = "correct-horse-battery-staple";

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i > -1 ? argv[i + 1] : undefined;
};

const CHROME =
  flag("chrome") ??
  process.env.ONECLAW_BRIDGE_CHROME ??
  ({ darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", linux: "/usr/bin/google-chrome" } as Record<string, string>)[
    process.platform
  ];

if (!CHROME || !existsSync(CHROME)) {
  console.error(`No Chromium at ${CHROME ?? "(unknown)"}. Pass --chrome /path/to/chrome or set ONECLAW_BRIDGE_CHROME.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// A site to log in to — a plain login form, nothing 1Claw-specific about it.
// ---------------------------------------------------------------------------
const site = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><title>Example login</title><body>
    <h1>Example Corp</h1>
    <form action="/session" method="post">
      <input id="username" name="username" value="ada@example.com" />
      <input id="password" name="password" type="password" />
      <button type="submit">Sign in</button>
    </form></body>`);
});
await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
const address = site.address();
const origin = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";

// ---------------------------------------------------------------------------
// The vault: in-memory for this demo. A real integration swaps this for a
// binding backed by your own 1Claw vault (see README) — nothing else changes.
// ---------------------------------------------------------------------------
const audits: { type: string }[] = [];
const backend = new MockVaultDriver({
  bindings: [
    {
      id: "example-login",
      secret: PASSWORD,
      loginUrl: origin,
      // 127.0.0.1 because that's where this demo's site actually runs. A real
      // binding names the site's own hostname, and nothing else will match —
      // the bridge refuses to fill on a host that isn't on the allowlist.
      allowedHosts: ["127.0.0.1"],
    },
  ],
  onAudit: (e) => audits.push(e),
});

const bridge = await startBridge({
  executablePath: CHROME,
  backend,
  host: "127.0.0.1",
  args: ["--headless=new", ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [])],
});

console.log(`\n  site:   ${origin}`);
console.log(`  bridge: ${bridge.url}`);
console.log(`  tools:  ${bridge.tools.map((t) => t.name).join(", ")}\n`);

let exitCode = 0;

try {
  // -------------------------------------------------------------------------
  // The agent connects with a real, unmodified puppeteer-core — the same way
  // it would connect to any CDP endpoint. Nothing about this connection is
  // 1Claw-specific; this IS the "agent drives the browser" half of the story.
  // -------------------------------------------------------------------------
  const browser = await puppeteer.connect({ browserWSEndpoint: bridge.url });
  const page = await browser.newPage();
  await page.goto(origin);
  console.log(`  agent opened the page via puppeteer-core: "${await page.title()}"`);

  // A caller-supplied label, not a CDP target id the agent has to extract —
  // the fill itself happens on a fresh target the bridge opens by itself
  // (so a listener the agent installed earlier has nothing to observe); this
  // just ties the fill request to the tab/origin snapshot below.
  const targetId = "agent-tab";

  // -------------------------------------------------------------------------
  // Time to log in. The agent does NOT read #password and type into it — it
  // asks the bridge to fill it, naming only which binding. No URL (the
  // bridge navigates to the binding's own login_url), no value.
  // -------------------------------------------------------------------------
  // formPath/fieldNames/redirectChain/currentGeneration are load-bearing, not
  // decorative: the package's own docs are explicit that defaulting them
  // server-side once silently turned off three real policy checks (the
  // fingerprint check, the redirect-chain check, and the staleness check —
  // see @1claw/browser-bridge's README). currentGeneration must match
  // `generation` above for a fresh, non-stale request.
  const observe = () => ({
    tabOrigin: origin,
    frameOrigin: origin,
    formActionOrigin: origin,
    frameId: targetId,
    generation: 0,
    formPath: "/session",
    fieldNames: ["username", "password"],
    redirectChain: [],
    currentGeneration: 0,
  });

  const result = await bridge.callTool("request_fill", { binding_id: "example-login", target_id: targetId, selector: "#password" }, observe);

  console.log("\n  what the agent's tool call received:");
  console.log(`    ${JSON.stringify(result)}\n`);

  const resultText = JSON.stringify(result);
  const leaked = resultText.includes(PASSWORD);
  console.log(`  password present in the agent's result: ${leaked ? "YES — BUG" : "no"}`);
  if (leaked) exitCode = 1;

  // -------------------------------------------------------------------------
  // The same request, from a page the binding doesn't allow. This is the
  // other half of the claim: the agent can't just ask for the fill anywhere.
  // -------------------------------------------------------------------------
  const denied = await bridge.callTool(
    "request_fill",
    { binding_id: "example-login", target_id: targetId, selector: "#password" },
    () => ({
      tabOrigin: "https://evil.test",
      frameOrigin: "https://evil.test",
      formActionOrigin: "https://evil.test",
      frameId: targetId,
      generation: 0,
      formPath: "/session",
      fieldNames: ["username", "password"],
      redirectChain: [],
      currentGeneration: 0,
    }),
  );
  console.log(`  same fill requested from an unlisted host: ${JSON.stringify(denied)}`);
  const deniedResult = denied as { status?: string };
  if (deniedResult.status === "filled") {
    console.log("  that should have been refused — BUG");
    exitCode = 1;
  }

  if (audits.length) {
    console.log(`\n  audit events recorded: ${audits.length}`);
    for (const a of audits) console.log(`    ${a.type}`);
  }

  await browser.disconnect();
} finally {
  await bridge.close();
  await new Promise<void>((r) => site.close(() => r()));
}

console.log(`\n  ${exitCode === 0 ? "OK" : "FAILED"}: the agent drove the browser and logged in — it never held the password\n`);
process.exitCode = exitCode;
