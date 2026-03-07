export interface ShroudResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    code?: string;
  };
  inspection?: {
    unicode_normalized?: boolean;
    command_injection_detected?: ThreatDetection[];
    social_engineering_detected?: ThreatDetection[];
    encoding_detected?: ThreatDetection[];
    network_threats_detected?: ThreatDetection[];
    filesystem_threats_detected?: ThreatDetection[];
    injection_score?: number;
    pii_detected?: boolean;
  };
}

export interface ThreatDetection {
  threat_type: string;
  pattern: string;
  location?: string;
  severity: string;
}

export async function sendToShroud(
  shroudUrl: string,
  token: string,
  prompt: string,
  openaiKey?: string
): Promise<ShroudResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Shroud-Provider": "openai",
  };

  if (openaiKey) {
    headers["X-Shroud-Api-Key"] = openaiKey;
  }

  const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 50,
  };

  try {
    const resp = await fetch(`${shroudUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // Get headers for inspection metadata
    const inspectionHeader = resp.headers.get("X-Shroud-Inspection");
    let inspection: ShroudResponse["inspection"] | undefined;
    if (inspectionHeader) {
      try {
        inspection = JSON.parse(inspectionHeader);
      } catch {
        // Ignore parse errors
      }
    }

    if (!resp.ok) {
      const errorBody = await resp.text();
      return {
        error: { message: errorBody, code: String(resp.status) },
        inspection,
      };
    }

    const data = await resp.json();
    return { ...data, inspection };
  } catch (err) {
    return {
      error: { message: String(err), code: "network_error" },
    };
  }
}

export function formatThreats(threats: ThreatDetection[] | undefined): string {
  if (!threats || threats.length === 0) return "None";
  return threats
    .map((t) => `${t.pattern} (${t.severity})`)
    .join(", ");
}

export function printResult(
  label: string,
  input: string,
  result: string,
  detected: boolean
): void {
  const icon = detected ? "⚠" : "✓";
  console.log(`[${label}]`);
  console.log(`  Input:  "${input.slice(0, 60)}${input.length > 60 ? "..." : ""}"`);
  console.log(`  Result: ${icon} ${result}\n`);
}
