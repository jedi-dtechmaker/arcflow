export async function sendUsdcOnArc({ userId, recipient, amount }) {
  if (!recipient.startsWith("0x")) {
    throw new Error("Recipient must be a wallet address for direct on-chain send.");
  }

  const response = await fetch("http://localhost:3001/api/circle/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      destinationAddress: recipient,
      amount: amount.toString()
    })
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Transfer failed");
  }

  return data.txHash;
}
