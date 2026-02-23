/**
 * x402 client — pays $0.001 USDC on Base to access the paywall server.
 *
 * Uses a smart account (ERC-1271) with a session key for signing.
 * Compatible with the x402 v2 protocol via @x402/evm/exact/client.
 *
 * Run:  npm run client
 * (start x402-server.ts first with `npm run server`)
 */

import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner, type ClientEvmSigner } from "@x402/evm";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
    encode1271Signature,
    getAccount,
    getOwnableValidatorSignature,
} from "@rhinestone/module-sdk";
import { OWNABLE_VALIDATOR } from "@ampersend_ai/ampersend-sdk/smart-account";

const SESSION_KEY = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
const SMART_ACCOUNT = process.env.SMART_ACCOUNT_ADDRESS as `0x${string}`;
const SERVER_URL = process.env.X402_SERVER_URL ?? "http://localhost:4021";

if (!SESSION_KEY || !SMART_ACCOUNT) {
    console.error("Required: BUYER_PRIVATE_KEY, SMART_ACCOUNT_ADDRESS");
    process.exit(1);
}

const sessionKeyAccount = privateKeyToAccount(SESSION_KEY);

const publicClient = createPublicClient({
    chain: base,
    transport: http(),
});

/**
 * ERC-1271 signer: signs typed data with the session key, then wraps
 * the signature for the smart account's OwnableValidator module.
 */
const smartAccountSigner: Omit<ClientEvmSigner, "readContract"> = {
    address: SMART_ACCOUNT,
    async signTypedData(params) {
        const eoaSig = await sessionKeyAccount.signTypedData(params as Parameters<typeof sessionKeyAccount.signTypedData>[0]);
        const validatorSig = getOwnableValidatorSignature({
            signatures: [eoaSig],
        });
        return encode1271Signature({
            account: getAccount({ address: SMART_ACCOUNT, type: "safe" }),
            validator: OWNABLE_VALIDATOR,
            signature: validatorSig,
        });
    },
};

const signer = toClientEvmSigner(smartAccountSigner, publicClient);

const client = new x402Client();
registerExactEvmScheme(client, { signer });
const paymentFetch = wrapFetchWithPayment(fetch, client);

console.log("=== x402 Client (Smart Account) ===\n");
console.log(`Smart account: ${SMART_ACCOUNT}`);
console.log(`Session key:   ${sessionKeyAccount.address}`);
console.log(`Server:        ${SERVER_URL}`);
console.log(`\nRequesting /joke ($0.001 USDC on Base)...\n`);

const res = await paymentFetch(`${SERVER_URL}/joke`);

console.log(`Status: ${res.status}`);

if (res.ok) {
    const data = await res.json();
    console.log(`\nResponse:`, JSON.stringify(data, null, 2));
} else {
    const text = await res.text();
    console.log(`\nError: ${text}`);
}

console.log("\nDone.");
