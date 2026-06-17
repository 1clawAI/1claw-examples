/**
 * Send a SIGNA wallet-signed DM whose signature is produced by a key held in
 * 1Claw's HSM/TEE. The agent process never touches the private key:
 *
 *   SIGNA builds the canonical preimage
 *     → 1Claw personal_sign (key in HSM) returns the signature
 *       → SignaAgent posts the signed DM
 *         → anyone re-verifies it to the custodied address.
 *
 * 1Claw = custody. SIGNA = what the key does. No key on disk, ever.
 */
import { createClient } from "@1claw/sdk";
import { SignaAgent, type SignaSigner } from "signa-agent";
import { recoverMessageAddress } from "viem";

const BASE_URL = process.env.ONECLAW_BASE_URL ?? "https://api.1claw.xyz";
const AGENT_ID = process.env.ONECLAW_AGENT_ID;
const AGENT_API_KEY = process.env.ONECLAW_AGENT_API_KEY;
const AGENT_ADDRESS = (process.env.ONECLAW_AGENT_ADDRESS ?? "").toLowerCase();
const SIGNA_BASE = process.env.SIGNA_BASE_URL ?? "https://www.signaagent.xyz";
const RECIPIENT = (process.env.SIGNA_RECIPIENT ?? "0x0000000000000000000000000000000000000001").toLowerCase();

if (!AGENT_ID || !AGENT_API_KEY || !AGENT_ADDRESS) {
    console.error("❌ Run `npm run setup` first, then set ONECLAW_AGENT_ID / ONECLAW_AGENT_API_KEY / ONECLAW_AGENT_ADDRESS in .env");
    process.exit(1);
}

const claw = createClient({ baseUrl: BASE_URL, apiKey: AGENT_API_KEY!, agentId: AGENT_ID! });

// A SignaSigner is just { address, signMessage, signTypedData } — SIGNA never
// sees the key; it hands the preimage to 1Claw and uses the returned signature.
const signer: SignaSigner = {
    address: AGENT_ADDRESS as `0x${string}`,
    async signMessage({ message }) {
        const preimage = typeof message === "string" ? message : message.raw;
        const { data, error } = await claw.agents.sign(AGENT_ID!, {
            intent_type: "personal_sign",
            chain: "base",
            message: preimage,
        });
        if (error) throw new Error(`1Claw personal_sign failed: ${error.message}`);
        return data!.signature as `0x${string}`;
    },
    async signTypedData(typedData: unknown) {
        // For SIGNA x402 payments (EIP-3009). 1Claw signs EIP-712 the same way.
        const { data, error } = await claw.agents.sign(AGENT_ID!, {
            intent_type: "typed_data",
            chain: "base",
            typed_data: typedData,
        } as never);
        if (error) throw new Error(`1Claw typed_data sign failed: ${error.message}`);
        return data!.signature as `0x${string}`;
    },
};

async function main() {
    // No privateKey — signing is fully delegated to 1Claw.
    const agent = new SignaAgent({ account: signer, baseUrl: SIGNA_BASE });
    console.log(`\n🔑 Custodied agent: ${agent.address}`);
    console.log("   (private key lives in 1Claw — this process never holds it)\n");

    const body = `gm — signed by a key in 1Claw's HSM, posted via SIGNA @ ${new Date().toISOString()}`;
    const dm = await agent.send(RECIPIENT, body);
    console.log(`📨 Sent SIGNA DM ${dm.id} → ${RECIPIENT}`);

    // Re-verify the signature locally — recovers the custodied address.
    const thread = await fetch(`${SIGNA_BASE}/api/dm/thread?a=${agent.address}&b=${RECIPIENT}`).then((r) => r.json());
    const row = (thread.dms ?? []).find((d: { id: string }) => d.id === dm.id);
    if (row?.signature) {
        const recovered = (await recoverMessageAddress({ message: row.signed_message ?? body, signature: row.signature })).toLowerCase();
        console.log(`\n✅ Re-verified offline → recovered ${recovered}`);
        console.log(`   matches the custodied address: ${recovered === agent.address}`);
    }
    console.log(`\n🔎 Anyone can re-verify: ${SIGNA_BASE}/api/verify  (kind "dm")`);
}

main().catch((err) => {
    console.error("\n❌ Error:", err);
    process.exit(1);
});
