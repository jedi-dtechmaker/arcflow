import { custom, erc20Abi, parseUnits } from "viem";
import { arcTestnet, ARC_CHAIN_ID, USDC_ADDRESS } from "@/lib/arc";

export async function sendUsdcOnArc({ wallet, recipient, amount }) {
  if (!recipient.startsWith("0x")) {
    throw new Error("Recipient must be a wallet address for direct on-chain send.");
  }

  await wallet.switchChain?.(ARC_CHAIN_ID);
  const provider = await wallet.getEthereumProvider();
  const { createWalletClient } = await import("viem");
  const walletClient = createWalletClient({
    account: wallet.address,
    chain: arcTestnet,
    transport: custom(provider)
  });

  return walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, parseUnits(amount, 6)]
  });
}
