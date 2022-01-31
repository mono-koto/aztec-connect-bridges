import { network } from "hardhat";

export async function start(blockNumber = 14083372) {
    /// Use mainnet fork as provider
    console.log(`forking to ${blockNumber} on ${process.env.MAINNET_URL}`);
    return network.provider.request({
        method: "hardhat_reset",
        params: [
            {
                forking: {
                    jsonRpcUrl: process.env.MAINNET_URL,
                    blockNumber: blockNumber,
                },
            },
        ],
    });
}

export async function reset() {
    return await network.provider.request({
        method: "hardhat_reset",
        params: [],
    });
}

export default { start, reset };
