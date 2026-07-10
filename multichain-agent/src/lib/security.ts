/**
 * Lightweight Shroud-style security inspection for the multichain agent demo.
 * Detects prompt injection, command injection, social engineering, and credential exfil attempts.
 */

export interface ThreatDetection {
  type: string;
  pattern: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface InspectionReport {
  safe: boolean;
  verdict: "clean" | "suspicious" | "malicious";
  threat_count: number;
  threats: ThreatDetection[];
  shroud_enabled: boolean;
  inspected_at: string;
}

const PROMPT_INJECTION_PATTERNS = [
  {
    name: "instruction_override",
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:your|previous|prior|above)\s+(?:instructions?|rules?|guidelines?|system\s+prompt)/i,
    severity: "critical" as const,
    description: "Attempts to override the system prompt and bypass safety guidelines",
  },
  {
    name: "role_hijack",
    pattern: /\b(?:you\s+are\s+now|act\s+as|pretend\s+(?:to\s+be|you\s+are)|from\s+now\s+on\s+you\s+(?:are|will))\b/i,
    severity: "high" as const,
    description: "Attempts to reassign the agent's role or persona",
  },
  {
    name: "jailbreak_dan",
    pattern: /\b(?:DAN|do\s+anything\s+now|developer\s+mode|jailbreak)\b/i,
    severity: "critical" as const,
    description: "Known jailbreak technique attempting unrestricted model access",
  },
  {
    name: "system_prompt_extraction",
    pattern: /\b(?:(?:what|show|reveal|print|repeat|output)\s+(?:is\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions|rules))\b/i,
    severity: "high" as const,
    description: "Attempts to extract the system prompt or internal instructions",
  },
  {
    name: "instruction_injection",
    pattern: /\[(?:SYSTEM|INST|SYS)\]|<\|(?:im_start|system|end_header_id)\|>|<<\s*SYS\s*>>/i,
    severity: "critical" as const,
    description: "Injects model-specific control tokens to insert system-level instructions",
  },
];

const COMMAND_INJECTION_PATTERNS = [
  {
    name: "shell_chain",
    pattern: /(?:;|\||&&|\|\|)\s*(?:curl|wget|bash|sh|nc|python|perl|ruby|php|node)\b/i,
    severity: "critical" as const,
    description: "Chained shell command execution attempt",
  },
  {
    name: "command_substitution",
    pattern: /\$\([^)]+\)|`[^`]+`/,
    severity: "critical" as const,
    description: "Command substitution attempting arbitrary code execution",
  },
  {
    name: "reverse_shell",
    pattern: /(?:bash\s+-i|nc\s+-[elp]|python\s+-c\s+['"]import\s+(?:socket|os))/i,
    severity: "critical" as const,
    description: "Reverse shell payload detected",
  },
];

const SOCIAL_ENGINEERING_PATTERNS = [
  {
    name: "authority_claim",
    pattern: /\b(?:i\s+am\s+(?:an?\s+)?(?:admin|administrator|manager|root|superuser|developer|owner))\b/i,
    severity: "high" as const,
    description: "False authority claim to escalate privileges",
  },
  {
    name: "secrecy",
    pattern: /\b(?:don't\s+tell\s+(?:anyone|anybody)|keep\s+(?:this\s+)?secret|between\s+us)\b/i,
    severity: "high" as const,
    description: "Secrecy request suggesting social engineering",
  },
  {
    name: "bypass_request",
    pattern: /\b(?:skip|bypass|disable|turn\s+off)\s+(?:the\s+)?(?:verification|authentication|security|guardrails?|checks?|validation)\b/i,
    severity: "critical" as const,
    description: "Explicit request to disable security controls",
  },
  {
    name: "credential_request",
    pattern: /\b(?:(?:what\s+is|tell\s+me|give\s+me|show\s+me|reveal|expose)\s+(?:your|the|my)\s+(?:password|api[\s_-]?key|secret|credentials?|token|private[\s_-]?key|signing[\s_-]?key|mnemonic|seed\s+phrase))\b/i,
    severity: "critical" as const,
    description: "Attempts to extract credentials or private keys from the agent",
  },
];

const EXFIL_PATTERNS = [
  {
    name: "key_exfil",
    pattern: /\b(?:send|transfer|move)\s+(?:all|every|entire)\s+(?:funds?|balance|money|ADA|ETH|SOL|BTC|XRP|TRX)\b/i,
    severity: "critical" as const,
    description: "Attempts to drain all funds from the wallet",
  },
  {
    name: "data_exfil",
    pattern: /(?:curl|wget|nc)\s+(?:(?:-[a-zA-Z]*\s+)|(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+)*https?:\/\//i,
    severity: "critical" as const,
    description: "Data exfiltration via external HTTP request",
  },
  {
    name: "private_key_header",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: "critical" as const,
    description: "Private key material detected in content",
  },
];

export function inspectContent(content: string): InspectionReport {
  const threats: ThreatDetection[] = [];

  const allPatterns = [
    ...PROMPT_INJECTION_PATTERNS.map((p) => ({ ...p, type: "prompt_injection" })),
    ...COMMAND_INJECTION_PATTERNS.map((p) => ({ ...p, type: "command_injection" })),
    ...SOCIAL_ENGINEERING_PATTERNS.map((p) => ({ ...p, type: "social_engineering" })),
    ...EXFIL_PATTERNS.map((p) => ({ ...p, type: "exfiltration" })),
  ];

  for (const def of allPatterns) {
    if (def.pattern.test(content)) {
      threats.push({
        type: def.type,
        pattern: def.name,
        severity: def.severity,
        description: def.description,
      });
    }
  }

  const hasCritical = threats.some((t) => t.severity === "critical");
  const hasHigh = threats.some((t) => t.severity === "high");

  return {
    safe: threats.length === 0,
    verdict: hasCritical ? "malicious" : hasHigh ? "suspicious" : threats.length > 0 ? "suspicious" : "clean",
    threat_count: threats.length,
    threats,
    shroud_enabled: true,
    inspected_at: new Date().toISOString(),
  };
}
