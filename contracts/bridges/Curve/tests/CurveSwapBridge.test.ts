import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { CurveSwapBridge, ERC20 } from "../../../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { AztecAssetType } from "./aztec";
import * as mainnet from "./mainnet";

import { RollupProcessor } from "../../../../src/rollup_processor";

chai.use(solidity);

describe("CurveSwapBridge", function () {
    let bridge: CurveSwapBridge;
    let rollupContract: RollupProcessor;
    let deployer: SignerWithAddress;
    let signer: SignerWithAddress;
    let usdc: ERC20;
    let cvx: ERC20;
    let dai: ERC20;

    beforeAll(async () => {
        [deployer, signer] = await ethers.getSigners();

        const f = await ethers.getContractFactory("DefiBridgeProxy");
        const defiBridgeProxy = await f.deploy();
        await defiBridgeProxy.deployed();

        rollupContract = await RollupProcessor.deploy(signer, [defiBridgeProxy.address]);

        const Bridge = await ethers.getContractFactory("CurveSwapBridge");
        bridge = (await Bridge.deploy(
            rollupContract.address,
            mainnet.CURVE_ADDRESS_PROVIDER,
            mainnet.WETH_ADDRESS
        )) as CurveSwapBridge;
        await bridge.deployed();

        usdc = await ethers.getContractAt("ERC20", mainnet.USDC_ADDRESS);
        cvx = await ethers.getContractAt("ERC20", mainnet.CVX_ADDRESS);
        dai = await ethers.getContractAt("ERC20", mainnet.DAI_ADDRESS);
    });

    it("should swap ERC20 tokens (USDC -> DAI)", async () => {
        const amount = 10000000n;

        await rollupContract.preFundContractWithToken(signer, {
            name: "USDC",
            erc20Address: usdc.address,
            amount: amount,
          });

        const usdcOrigBalance = await usdc.balanceOf(rollupContract.address);
        const daiOrigBalance = await dai.balanceOf(rollupContract.address);

        const {
            isAsync,
            outputValueA,
            outputValueB,
        } = await rollupContract.convert(
            signer,
            bridge.address,
            {
                id: 0,
                erc20Address: mainnet.USDC_ADDRESS,
                assetType: AztecAssetType.ERC20,
            },
            {
                id: 0,
                erc20Address: ethers.constants.AddressZero,
                assetType: 0,
            },
            {
                id: 1,
                erc20Address: mainnet.DAI_ADDRESS,
                assetType: AztecAssetType.ERC20,
            },
            {
                id: 0,
                erc20Address: ethers.constants.AddressZero,
                assetType: 0,
            },
            amount,
            1n,
            0n
        );
        expect(outputValueB).to.equal(0n);
        expect(isAsync).to.be.false;

        const daiNewBalance = await dai.balanceOf(rollupContract.address);
        expect(daiNewBalance).to.be.equal(daiOrigBalance.add(outputValueA));

        const usdcNewBalance = await usdc.balanceOf(rollupContract.address);
        expect(usdcNewBalance).to.be.equal(usdcOrigBalance.sub(amount));
    });
});
