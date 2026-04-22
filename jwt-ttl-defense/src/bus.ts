/**
 * A tiny in-process pub/sub used to simulate a covert exfiltration channel
 * between the compromised "victim agent" process and an external
 * "attacker" service. In a real breach this could be a Discord webhook,
 * an attacker-controlled HTTP endpoint injected via a malicious tool call,
 * or output written to a log the attacker can read.
 *
 * Keeping it in-process lets the demo run as a single Node script while
 * still preserving the narrative that the JWT *leaves* the agent's trust
 * boundary and *arrives* somewhere the attacker controls.
 */
export interface LeakedCredential {
    leakedAt: number;
    token: string;
    agentId: string;
    vaultId: string;
    note: string;
}

type Listener = (leak: LeakedCredential) => void;

class ExfilChannel {
    private listeners: Listener[] = [];

    publish(leak: LeakedCredential): void {
        for (const fn of this.listeners) fn(leak);
    }

    subscribe(fn: Listener): () => void {
        this.listeners.push(fn);
        return () => {
            this.listeners = this.listeners.filter((x) => x !== fn);
        };
    }

    /** Wait for the next leak, or throw after `timeoutMs`. */
    waitForNext(timeoutMs: number): Promise<LeakedCredential> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                unsub();
                reject(new Error(`No credential leaked within ${timeoutMs}ms`));
            }, timeoutMs);
            const unsub = this.subscribe((leak) => {
                clearTimeout(timer);
                unsub();
                resolve(leak);
            });
        });
    }
}

export const exfilChannel = new ExfilChannel();
