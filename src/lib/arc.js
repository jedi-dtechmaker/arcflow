import { defineChain } from "viem";

export const ARC_CHAIN_ID = 5042002;
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] }
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: ARC_EXPLORER_URL
    }
  },
  testnet: true
});
