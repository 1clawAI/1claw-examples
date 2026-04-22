/**
 * 1Claw Shroud integration for the demo.
 *
 * Shroud (`shroud.1claw.xyz`) is 1Claw's TEE-hosted LLM proxy. Agents
 * route their chat traffic through it and Shroud inspects both
 * directions using a pipeline of filters — credential regexes, network
 * exfiltration patterns, prompt-injection scoring, tool-call argument
 * scanning, output policies, etc.
 *
 * Per-agent behavior is driven by `shroud_enabled` + `shroud_config` on
 * the agent record (stored in Vault, included in the agent's JWT after
 * `re-exchange`). Toggling this on the agent is what flips the
 * protection for real.
 *
 * This module contributes two things to the demo:
 *
 *   1. `buildShroudConfig()` — the `shroud_config` blob we attach to
 *      the agent when `DEMO_SHROUD=1`. The shape is exactly what Shroud
 *      reads in production, so you can copy it into your own SDK call
 *      and it'll Just Work.
 *
 *   2. `inspectLlmResponse(text)` — a *local emulation* of the two
 *      Shroud filters that block this specific attack:
 *        - `response_filter` (see shroud/src/inspection/response_filter.rs)
 *          → scans the LLM response body for credential patterns
 *          (bearer tokens, API keys, private-key headers, etc.).
 *        - `network_detection` (see shroud/src/inspection/network_detection.rs)
 *          → flags requests to blocked domains (`evil.example`).
 *
 *      In a real deployment these run inside Shroud's TEE on the
 *      response from the LLM provider — before the agent's tool loop
 *      ever sees the text. We run them locally so the demo can show
 *      the protection end-to-end without requiring a real upstream
 *      LLM provider key.
 */

import type { ShroudConfig } from "@1claw/sdk";

/**
 * Strict per-agent Shroud policy for this scenario.
 * Kept small so a reader can see the knobs that matter.
 */
export function buildShroudConfig(): ShroudConfig {
    return {
        // Treat any detection as an outright block (no redaction fallback).
        sanitization_mode: "block",
        threat_logging: true,

        // Scan the LLM's response body for credential-shaped strings
        // (bearer tokens, AWS keys, GitHub tokens, private keys, etc.).
        // This is what catches a JWT being echoed back by a compromised
        // tool-loop.
        enable_response_filtering: true,

        // Tool calls are one of the primary exfil channels in an LLM
        // agent. Block any tool call whose arguments appear to carry
        // credentials, and scan string arguments by default.
        tool_call_inspection: {
            enabled: true,
            scan_arguments: true,
            block_credential_exfil: true,
            action: "block",
        },

        // Block the fake attacker domain used in this demo. In a real
        // deployment you'd list your actual known-bad domains and/or
        // maintain an allow-list of approved third-party APIs.
        network_detection: {
            enabled: true,
            action: "block",
            blocked_domains: ["evil.example", "evil.example.com"],
        },

        // Hunts for 1Claw-issued tokens (JWT-shaped, `ocv_`, `1ck_`)
        // appearing in model output — a strong signal something
        // exfiltrated them.
        secret_injection_detection: { enabled: true, action: "block" },

        // Catches base64-encoded tokens and "token split across
        // messages" evasions; sympathetic to the credential regexes
        // above.
        advanced_redaction: {
            enabled: true,
            detect_base64_encoded: true,
            detect_split_secrets: true,
            detect_prefix_leak: true,
            min_secret_length: 20,
        },

        // Block PII and common prompt-injection scoring signals.
        pii_policy: "block",
        injection_threshold: 0.6,
    };
}

/** Result of running the local Shroud emulator over an LLM response. */
export interface InspectionResult {
    blocked: boolean;
    detectors: string[];
    /** Human-readable reasons for display. */
    reasons: string[];
}

/**
 * Credential patterns copied from shroud/src/inspection/response_filter.rs
 * (keep in sync). These run against the raw LLM response string.
 */
const CREDENTIAL_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
    { name: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: "github_token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/ },
    { name: "slack_token", regex: /\bxox[baprs]-[0-9]+-[0-9]+-[A-Za-z0-9]+\b/ },
    { name: "private_key_header", regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
    { name: "stripe_key", regex: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
    { name: "generic_bearer_token", regex: /(?:bearer\s+)[A-Za-z0-9_\-.]{20,}/i },
    { name: "jwt_shape", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
    { name: "oneclaw_user_key", regex: /\b1ck_[A-Za-z0-9_-]{20,}\b/ },
    { name: "oneclaw_agent_key", regex: /\bocv_[A-Za-z0-9_-]{20,}\b/ },
];

/** Domains Shroud's network_detection layer is configured to block. */
const BLOCKED_DOMAINS: ReadonlyArray<string> = ["evil.example", "evil.example.com"];

/**
 * Inspect a simulated LLM response body the way Shroud would on the
 * agent's ingress path. Any match blocks the response.
 */
export function inspectLlmResponse(body: string): InspectionResult {
    const detectors: string[] = [];
    const reasons: string[] = [];

    for (const p of CREDENTIAL_PATTERNS) {
        if (p.regex.test(body)) {
            detectors.push(`response_filter:${p.name}`);
            reasons.push(`credential pattern "${p.name}" in LLM response`);
        }
    }

    for (const d of BLOCKED_DOMAINS) {
        if (body.toLowerCase().includes(d)) {
            detectors.push(`network_detection:${d}`);
            reasons.push(`outbound URL to blocked domain "${d}"`);
        }
    }

    return { blocked: detectors.length > 0, detectors, reasons };
}
