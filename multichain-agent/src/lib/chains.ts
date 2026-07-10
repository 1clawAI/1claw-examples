export type ChainKey = "ethereum" | "bitcoin" | "solana" | "xrp" | "cardano" | "tron";

export type ChainConfig = {
  key: ChainKey;
  label: string;
  signingKeyChain: ChainKey;
  testnetChain: string;
  nativeSymbol: string;
  demoAmount: string;
  /** Burn / faucet-safe recipient for smoke tests */
  demoRecipient: string;
  faucet: { label: string; url: string; note?: string };
  explorerAddress: (address: string) => string;
  explorerTx: (hash: string) => string;
};

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    key: "ethereum",
    label: "Ethereum Sepolia",
    signingKeyChain: "ethereum",
    testnetChain: "sepolia",
    nativeSymbol: "ETH",
    demoAmount: "0.0001",
    demoRecipient: "0x000000000000000000000000000000000000dEaD",
    faucet: { label: "Sepolia Faucet", url: "https://sepoliafaucet.com/" },
    explorerAddress: (a) => `https://sepolia.etherscan.io/address/${a}`,
    explorerTx: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  {
    key: "bitcoin",
    label: "Bitcoin Signet",
    signingKeyChain: "bitcoin",
    testnetChain: "bitcoin-signet",
    nativeSymbol: "BTC",
    demoAmount: "0.00001",
    demoRecipient: "tb1qaveynz2s05xgccmy65hd2uz4cz4vl5eu7u93yq",
    faucet: { label: "Signet Faucet", url: "https://signet.bc-2.jp/" },
    explorerAddress: (a) => `https://mempool.space/signet/address/${a}`,
    explorerTx: (h) => `https://mempool.space/signet/tx/${h}`,
  },
  {
    key: "solana",
    label: "Solana Devnet",
    signingKeyChain: "solana",
    testnetChain: "solana-devnet",
    nativeSymbol: "SOL",
    demoAmount: "0.001",
    demoRecipient: "11111111111111111111111111111112",
    faucet: {
      label: "Solana Faucet",
      url: "https://faucet.solana.com/",
      note: "Or: solana airdrop 2 <address> --url devnet",
    },
    explorerAddress: (a) =>
      `https://explorer.solana.com/address/${a}?cluster=devnet`,
    explorerTx: (h) => `https://explorer.solana.com/tx/${h}?cluster=devnet`,
  },
  {
    key: "xrp",
    label: "XRP Testnet",
    signingKeyChain: "xrp",
    testnetChain: "xrp-testnet",
    nativeSymbol: "XRP",
    demoAmount: "1",
    demoRecipient: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    faucet: {
      label: "XRPL Testnet Faucet",
      url: "https://faucet.altnet.rippletest.net/accounts",
      note: "Auto-request available from the Funding panel",
    },
    explorerAddress: (a) => `https://testnet.xrpl.org/accounts/${a}`,
    explorerTx: (h) => `https://testnet.xrpl.org/transactions/${h}`,
  },
  {
    key: "cardano",
    label: "Cardano Preprod",
    signingKeyChain: "cardano",
    testnetChain: "cardano-preprod",
    nativeSymbol: "ADA",
    demoAmount: "1",
    demoRecipient: "addr_test1vryqz6wcwj6tz6jrv5cyl86emwvpunjjsm66n4mxm4mj7ls40mmg7",
    faucet: {
      label: "Cardano Preprod Faucet",
      url: "https://docs.cardano.org/cardano-testnets/tools/faucet/",
    },
    explorerAddress: (a) => `https://preprod.cardanoscan.io/address/${a}`,
    explorerTx: (h) => `https://preprod.cardanoscan.io/transaction/${h}`,
  },
  {
    key: "tron",
    label: "Tron Shasta",
    signingKeyChain: "tron",
    testnetChain: "tron-shasta",
    nativeSymbol: "TRX",
    demoAmount: "1",
    demoRecipient: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeR",
    faucet: {
      label: "Tron Shasta Faucet",
      url: "https://shasta.tronex.io/join/getJoinPage",
      note: "Captcha — 2000 TRX per request",
    },
    explorerAddress: (a) => `https://shasta.tronscan.org/#/address/${a}`,
    explorerTx: (h) => `https://shasta.tronscan.org/#/transaction/${h}`,
  },
];

export const SIGNING_KEY_CHAINS = SUPPORTED_CHAINS.map((c) => c.signingKeyChain);

export function chainByKey(key: string): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find(
    (c) => c.key === key || c.testnetChain === key || c.signingKeyChain === key,
  );
}

export function chainListForPrompt(): string {
  return SUPPORTED_CHAINS.map(
    (c) => `- ${c.label}: use chain "${c.testnetChain}" (${c.nativeSymbol})`,
  ).join("\n");
}

/** Bitcoin signet display address (bc1 main prefix → tb1 on signet) */
export function signetDisplayAddress(address: string): string {
  if (address.startsWith("bc1")) return "tb1" + address.slice(3);
  return address;
}

/** Cardano preprod display from mainnet-format addr1 */
export function cardanoPreprodAddress(address: string): string {
  if (address.startsWith("addr1")) {
    return address.replace(/^addr1/, "addr_test1");
  }
  return address;
}
