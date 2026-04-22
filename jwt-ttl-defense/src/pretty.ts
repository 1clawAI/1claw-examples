/**
 * Tiny console formatting helpers. Keeps the demo readable without
 * adding a color dependency.
 */
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const startedAt = Date.now();

function elapsed(): string {
    const ms = Date.now() - startedAt;
    const s = (ms / 1000).toFixed(2).padStart(5, " ");
    return `${GRAY}[t+${s}s]${RESET}`;
}

export function section(title: string, subtitle?: string): void {
    console.log("");
    console.log(`${BOLD}${CYAN}━━ ${title}${RESET}`);
    if (subtitle) console.log(`${GRAY}${subtitle}${RESET}`);
    console.log("");
}

export function step(label: string, detail?: string): void {
    const d = detail ? ` ${GRAY}${detail}${RESET}` : "";
    console.log(`${elapsed()} ${BLUE}●${RESET} ${label}${d}`);
}

export function ok(label: string, detail?: string): void {
    const d = detail ? ` ${GRAY}${detail}${RESET}` : "";
    console.log(`${elapsed()} ${GREEN}✓${RESET} ${label}${d}`);
}

export function warn(label: string, detail?: string): void {
    const d = detail ? ` ${GRAY}${detail}${RESET}` : "";
    console.log(`${elapsed()} ${YELLOW}⚠${RESET} ${label}${d}`);
}

export function fail(label: string, detail?: string): void {
    const d = detail ? ` ${GRAY}${detail}${RESET}` : "";
    console.log(`${elapsed()} ${RED}✗${RESET} ${label}${d}`);
}

export function attacker(label: string, detail?: string): void {
    const d = detail ? ` ${GRAY}${detail}${RESET}` : "";
    console.log(`${elapsed()} ${MAGENTA}☠ attacker${RESET} ${label}${d}`);
}

export function victim(label: string, detail?: string): void {
    const d = detail ? ` ${GRAY}${detail}${RESET}` : "";
    console.log(`${elapsed()} ${BLUE}🤖 agent  ${RESET} ${label}${d}`);
}

export function note(text: string): void {
    console.log(`${GRAY}       ${text}${RESET}`);
}

export function preview(token: string): string {
    if (!token) return "<empty>";
    if (token.length <= 20) return token;
    return `${token.slice(0, 12)}…${token.slice(-6)}`;
}
