const { createPublicClient, http, defineChain, formatUnits, erc20Abi } = require('viem');
const arcTestnet = defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
});
const USDC_ADDR = "0x3600000000000000000000000000000000000000";
const TREASURY = "0x15feDec9bb49ff1566faEb121F0A288E8FDb9aBAb";

async function check() {
    try {
        const client = createPublicClient({ chain: arcTestnet, transport: http() });
        const balance = await client.getBalance({ address: TREASURY });
        const usdc = await client.readContract({
            address: USDC_ADDR,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [TREASURY]
        });
        console.log(`GAS_BAL=${formatUnits(balance, 18)} ARC`);
        console.log(`USDC_BAL=${formatUnits(usdc, 6)} USDC`);
    } catch (e) {
        console.log('ERROR=' + e.message);
    }
}
check();
