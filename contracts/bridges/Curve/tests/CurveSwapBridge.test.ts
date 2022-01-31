import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { CurveSwapBridge, DefiBridgeProxy, ERC20 } from "../../../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { AztecAssetType } from "./aztec";
import { fundERC20FromAccount } from "./helpers";
import * as mainnet from "./mainnet";

import { RollupProcessor } from "../../../../src/rollup_processor";

chai.use(solidity);

describe("CurveSwapBridge", function () {
    let bridge: CurveSwapBridge;
    let rollupContract: RollupProcessor;
    let defiBridgeProxy: DefiBridgeProxy;
    let deployer: SignerWithAddress;
    let signer: SignerWithAddress;
    let usdc: ERC20;
    let cvx: ERC20;
    let dai: ERC20;

    before(async () => {
        [deployer, signer] = await ethers.getSigners();

        const f = await ethers.getContractFactory("DefiBridgeProxy");
        defiBridgeProxy = await f.deploy();
        await defiBridgeProxy.deployed();

        rollupContract = await RollupProcessor.deploy(signer, [defiBridgeProxy.address]);

        const Bridge = await ethers.getContractFactory("CurveSwapBridge");
        bridge = (await Bridge.deploy(
            defiBridgeProxy.address,
            mainnet.CURVE_ADDRESS_PROVIDER,
            mainnet.WETH_ADDRESS
        )) as CurveSwapBridge;
        await bridge.deployed();

        usdc = await ethers.getContractAt("ERC20", mainnet.USDC_ADDRESS);
        cvx = await ethers.getContractAt("ERC20", mainnet.CVX_ADDRESS);
        dai = await ethers.getContractAt("ERC20", mainnet.DAI_ADDRESS);
    });

    it("should swap ERC20 to ETH (CVX -> ETH)", async () => {
        const amount = 10000000000000000000n;
        await fundERC20FromAccount(cvx, mainnet.CVX_HOLDER_ADDRESS, defiBridgeProxy.address, amount);

        const cvxOrigBalance = await cvx.balanceOf(defiBridgeProxy.address);
        const ethOrigBalance = await ethers.provider.getBalance(defiBridgeProxy.address);

        const {
            isAsync,
            outputValueA,
            outputValueB,
        } = await rollupContract.convert(
            signer,
            bridge.address,
            {
                id: 0,
                erc20Address: mainnet.CVX_ADDRESS,
                assetType: AztecAssetType.ERC20,
            },
            {
                id: 0,
                erc20Address: ethers.constants.AddressZero,
                assetType: 0,
            },
            {
                id: 1,
                erc20Address: ethers.constants.AddressZero,
                assetType: AztecAssetType.ETH,
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
        expect(outputValueB).to.equal(0);
        expect(isAsync).to.be.false;

        const cvxNewBalance = await cvx.balanceOf(defiBridgeProxy.address);
        expect(cvxNewBalance).to.be.equal(cvxOrigBalance.sub(amount));

        const ethNewBalance = await ethers.provider.getBalance(defiBridgeProxy.address);
        expect(ethNewBalance).to.be.equal(ethOrigBalance.add(outputValueA));
    });

    // it("should swap ETH to ERC20 (ETH -> CVX)", async () => {
    //     const amount = ethers.utils.parseEther("1.0");

    //     await signer.sendTransaction({
    //         to: defiBridgeProxy.address,
    //         value: amount,
    //     });

    //     const ethOrigBalance = await ethers.provider.getBalance(defiBridgeProxy.address);
    //     const cvxOrigBalance = await cvx.balanceOf(defiBridgeProxy.address);

    //     const tx = defiBridgeProxy.convert(
    //         bridge.address,
    //         {
    //             id: 1,
    //             erc20Address: ethers.constants.AddressZero,
    //             assetType: AztecAssetType.ETH,
    //         },
    //         {
    //             id: 0,
    //             erc20Address: ethers.constants.AddressZero,
    //             assetType: 0,
    //         },
    //         {
    //             id: 0,
    //             erc20Address: mainnet.CVX_ADDRESS,
    //             assetType: AztecAssetType.ERC20,
    //         },
    //         {
    //             id: 0,
    //             erc20Address: ethers.constants.AddressZero,
    //             assetType: 0,
    //         },
    //         amount,
    //         1n,
    //         0n
    //     );
    //     await expect(tx).to.emit(defiBridgeProxy, "AztecBridgeInteraction");

    //     const receipt = await (await tx).wait();
    //     const ev = receipt.events!.find((e: any) => e.event === "AztecBridgeInteraction");
    //     const [contractAddress, outputA, outputB, isAsync] = ev!.args!;

    //     expect(contractAddress).to.eq(bridge.address);
    //     expect(outputB).to.equal(0);
    //     expect(isAsync).to.be.false;

    //     const ethNewBalance = await ethers.provider.getBalance(defiBridgeProxy.address);
    //     expect(ethNewBalance).to.be.equal(ethOrigBalance.sub(amount));

    //     // const cvxNewBalance = await cvx.balanceOf(defiBridgeProxy.address);
    //     // expect(cvxNewBalance).to.be.equal(cvxOrigBalance.add(outputA));
    // });

    // it("should swap ERC20 tokens (USDC -> DAI)", async () => {
    //     const amount = 10000000n;
    //     await fundERC20FromAccount(usdc, mainnet.USDC_HOLDER_ADDRESS, defiBridgeProxy.address, amount);

    //     const usdcOrigBalance = await usdc.balanceOf(defiBridgeProxy.address);
    //     const daiOrigBalance = await dai.balanceOf(defiBridgeProxy.address);

    //     const tx = defiBridgeProxy.convert(
    //         bridge.address,
    //         {
    //             id: 0,
    //             erc20Address: mainnet.USDC_ADDRESS,
    //             assetType: AztecAssetType.ERC20,
    //         },
    //         {
    //             id: 0,
    //             erc20Address: ethers.constants.AddressZero,
    //             assetType: 0,
    //         },
    //         {
    //             id: 1,
    //             erc20Address: mainnet.DAI_ADDRESS,
    //             assetType: AztecAssetType.ERC20,
    //         },
    //         {
    //             id: 0,
    //             erc20Address: ethers.constants.AddressZero,
    //             assetType: 0,
    //         },
    //         amount,
    //         1n,
    //         0n
    //     );
    //     // await expect(tx).to.emit(defiBridgeProxy, "AztecBridgeInteraction");

    //     // const receipt = await (await tx).wait();
    //     // const ev = receipt.events!.find((e: any) => e.event === "AztecBridgeInteraction");
    //     // const [contractAddress, outputA, outputB, isAsync] = ev!.args!;

    //     // expect(contractAddress).to.eq(bridge.address);
    //     expect(outputB).to.equal(0);
    //     expect(isAsync).to.be.false;

    //     const daiNewBalance = await dai.balanceOf(defiBridgeProxy.address);
    //     expect(daiNewBalance).to.be.equal(daiOrigBalance.add(outputA));

    //     const usdcNewBalance = await usdc.balanceOf(defiBridgeProxy.address);
    //     expect(usdcNewBalance).to.be.equal(usdcOrigBalance.sub(amount));
    // });
});
