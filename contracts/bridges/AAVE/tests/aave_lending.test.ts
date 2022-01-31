import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";

import DefiBridgeProxy from "../../../../src/artifacts/contracts/DefiBridgeProxy.sol/DefiBridgeProxy.json";
import { Contract, Signer, ContractFactory } from "ethers";
import {
  TestToken,
  AztecAssetType,
  AztecAsset,
  RollupProcessor,
} from "../../../../src/rollup_processor";

import { AaveLendingBridge, ERC20 } from "../../../../typechain-types";

import { randomBytes } from "crypto";


chai.use(solidity);

const fixEthersStackTrace = (err: Error) => {
  err.stack! += new Error().stack;
  throw err;
};

describe("defi bridge", function () {
  let rollupContract: RollupProcessor;
  let aaveBridgeAddress: string;
  let defiBridgeProxy: Contract;

  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const aDaiAddress = "0xfC1E690f61EFd961294b3e1Ce3313fBD8aa4f85d";
  const aaveAddressProvider = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";

  let signer: Signer;
  let aaveBridgeContract: AaveLendingBridge;

  const randomAddress = () => randomBytes(20).toString("hex");

  before(async () => {
    [signer] = await ethers.getSigners();

    const factory = new ContractFactory(
      DefiBridgeProxy.abi,
      DefiBridgeProxy.bytecode,
      signer
    );
    defiBridgeProxy = await factory.deploy([]);
    rollupContract = await RollupProcessor.deploy(signer, [
      defiBridgeProxy.address,
    ]);
  });

  beforeEach(async () => {
    // deploy the bridge and pass in any args
    const aaveFactory = await ethers.getContractFactory("AaveLendingBridge");
    aaveBridgeContract = await aaveFactory.deploy(
      rollupContract.address,
      aaveAddressProvider
    );
    await aaveBridgeContract.deployed();
  });

  it("should allow us to configure a new underlying to zkAToken mapping", async () => {
    const txResponse = await aaveBridgeContract
      .setUnderlyingToZkAToken(daiAddress)
      .catch(fixEthersStackTrace);
    await txResponse.wait();

    const zkAToken = await aaveBridgeContract.underlyingToZkAToken(daiAddress);
    expect(zkAToken).to.exist;
  });

  it("should not allow us to configure a new zkAToken if the underlying exists ", async () => {
    const addDai = async () => {
      return await aaveBridgeContract.setUnderlyingToZkAToken(daiAddress);
    };
    const txResponse = await addDai();
    await txResponse.wait();
    const zkAToken = await aaveBridgeContract.underlyingToZkAToken(daiAddress);
    expect(zkAToken).to.exist;
    // await expect(addDai()).rejects.toThrow("AaveLendingBridge: ZK_TOKEN_SET");
    const zkAToken2 = await aaveBridgeContract.underlyingToZkAToken(daiAddress);
    expect(zkAToken).to.eq(zkAToken2);
  });

  it("should correctly mint zkATokens and send them back to the rollup when convert is called with the underlying asset", async () => {
    const addDai = async () => {
      return await aaveBridgeContract.setUnderlyingToZkAToken(daiAddress);
    };
    const txResponse = await addDai();
    await txResponse.wait();
    const zkATokenAddress = await aaveBridgeContract.underlyingToZkAToken(
      daiAddress
    );

    const inputAsset = {
      assetId: 1,
      erc20Address: daiAddress,
      assetType: AztecAssetType.ERC20,
    };
    const outputAsset = {
      assetId: 2,
      erc20Address: zkATokenAddress,
      assetType: AztecAssetType.ERC20,
    };

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    const interactionNonce = 1n;
    // get  DAI into the rollup contract

    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: daiAddress,
      amount: quantityOfDaiToDeposit,
      name: "DAI",
    });

    const DAIContract = await ethers.getContractAt("ERC20", daiAddress, signer);
    const aDAIContract = await ethers.getContractAt(
      "ERC20",
      aDaiAddress,
      signer
    );
    const zkATokenContract = await ethers.getContractAt(
      "ERC20",
      zkATokenAddress,
      signer
    );
    const before = {
      rollupContract: {
        DAI: await DAIContract.balanceOf(rollupContract.address),
        zkAToken: 
          await zkATokenContract.balanceOf(rollupContract.address)
        ,
      },
      bridgeContract: {
        aToken:
          await aDAIContract.balanceOf(aaveBridgeContract.address)
        ,
      },
    };

    await rollupContract.convert(
      signer,
      aaveBridgeContract.address,
      inputAsset,
      {},
      outputAsset,
      {},
      quantityOfDaiToDeposit,
      1n,
      0n
    );

    const after = {
      rollupContract: {
        DAI: await DAIContract.balanceOf(rollupContract.address),
        zkAToken: 
          await zkATokenContract.balanceOf(rollupContract.address)
        ,
      },
      bridgeContract: {
        aToken:           await aDAIContract.balanceOf(aaveBridgeContract.address
        ),
      },
    };

    expect(before.rollupContract.DAI).to.equal(quantityOfDaiToDeposit);
    expect(before.rollupContract.zkAToken).to.equal(0n);
    expect(before.bridgeContract.aToken).to.equal(0n);
    expect(after.rollupContract.DAI).to.equal(0n);
    expect(after.bridgeContract.aToken).to.equal(quantityOfDaiToDeposit);

    expect(after.rollupContract.zkAToken).to.equal(940034212570988344321n);
  });
});
