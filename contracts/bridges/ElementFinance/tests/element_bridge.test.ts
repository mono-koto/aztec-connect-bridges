import { ethers } from "hardhat";
import DefiBridgeProxy from "../../../../src/artifacts/contracts/DefiBridgeProxy.sol/DefiBridgeProxy.json";
import { Contract, Signer, ContractFactory } from "ethers";
import {
  TestToken,
  AztecAssetType,
  AztecAsset,
  RollupProcessor,
} from "../../../../src/rollup_processor";
import { ElementBridge } from "../../../../src/element_bridge";
import ERC20 from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { randomBytes } from "crypto";
import * as VaultConfig from "./VaultConfig.json";
import { Curve } from "../../../../src/curve";

const fixEthersStackTrace = (err: Error) => {
  err.stack! += new Error().stack;
  throw err;
};

interface SwapQuantities {
  inputBridge: bigint;
  inputBalancer: bigint;
  outputBridge: bigint;
  outputBalancer: bigint;
}

interface ElementPoolSpec {
  underlyingAddress: string;
  wrappedPositionAddress: string;
  poolAddress: string;
  expiry: number;
  trancheAddress: string;
  name: string;
}

interface AssetSpec {
  decimals: bigint;
  quantityExponent: bigint;
  disabled: boolean;
}

interface AssetSpecs {
  specs: Map<string, AssetSpec>;
}

function buildPoolSpecs(asset: string, config: any) {
  const tranches = config.tranches[asset];
  if (!tranches) {
    return [];
  }
  return tranches.map((tranche: any) => {
    const spec = {
      underlyingAddress: config.tokens[asset],
      wrappedPositionAddress: config.wrappedPositions.yearn[asset],
      poolAddress: tranche.ptPool.address,
      expiry: tranche.expiration,
      trancheAddress: tranche.address,
      name: asset,
    } as ElementPoolSpec;
    return spec;
  });
}

const assetSpecs: AssetSpecs = {
  specs: new Map<string, AssetSpec>([
    [
      "usdc",
      {
        decimals: 6n,
        quantityExponent: 6n,
        disabled: false,
      },
    ], // working
    [
      "weth", // no tranches
      {
        decimals: 18n,
        quantityExponent: 18n,
        disabled: true,
      },
    ],
    [
      "dai",
      {
        decimals: 18n,
        quantityExponent: 18n,
        disabled: false,
      },
    ],
    [
      "lusd3crv-f",
      {
        decimals: 18n,
        quantityExponent: 9n,
        disabled: false,
      },
    ],
    [
      "crvtricrypto", // expiry too old
      {
        decimals: 18n,
        quantityExponent: 18n,
        disabled: true,
      },
    ],
    [
      "stecrv",
      {
        decimals: 18n,
        quantityExponent: 6n,
        disabled: false,
      },
    ],
    [
      "crv3crypto", // doesn't seem to have a pool associated with it
      {
        decimals: 18n,
        quantityExponent: 18n,
        disabled: true,
      },
    ],
    [
      "wbtc",
      {
        decimals: 8n,
        quantityExponent: 5n,
        disabled: false,
      },
    ],
    [
      "alusd3crv-f",
      {
        decimals: 18n,
        quantityExponent: 18n,
        disabled: false,
      },
    ],
    [
      "mim-3lp3crv-f",
      {
        decimals: 18n,
        quantityExponent: 18n,
        disabled: false,
      },
    ],
    [
      "eurscrv", // needs EURS which we can't seem to get on uniswap
      {
        decimals: 18n,
        quantityExponent: 18n,
        disabled: false,
      },
    ],
  ]),
};

jest.setTimeout(240000);

describe("defi bridge", function () {
  const vaultConfig = VaultConfig;
  let rollupContract: RollupProcessor;
  let defiBridgeProxy: Contract;
  let elementBridge: ElementBridge;
  const balancerAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const byteCodeHash = Buffer.from(
    "f481a073666136ab1f5e93b296e84df58092065256d0db23b2d22b62c68e978d",
    "hex"
  );
  const trancheFactoryAddress = "0x62F161BF3692E4015BefB05A03a94A40f520d1c0";
  let signer: Signer;

  const elementDaiWrappedPositionAddress =
    "0x21BbC083362022aB8D7e42C18c47D484cc95C193";

  const elementDaiApr2022Spec = {
    underlyingAddress: daiAddress,
    wrappedPositionAddress: elementDaiWrappedPositionAddress,
    poolAddress: "0xEdf085f65b4F6c155e13155502Ef925c9a756003",
    trancheAddress: "0x2c72692e94e757679289ac85d3556b2c0f717e0e",
    expiry: 1651275535,
  } as ElementPoolSpec;

  const elementDaiJan2022Spec = {
    underlyingAddress: daiAddress,
    wrappedPositionAddress: elementDaiWrappedPositionAddress,
    poolAddress: "0xA47D1251CF21AD42685Cc6B8B3a186a73Dbd06cf",
    trancheAddress: "0x449d7c2e096e9f867339078535b15440d42f78e8",
    expiry: 1643382446,
  } as ElementPoolSpec;

  const randomAddress = () => randomBytes(20).toString("hex");

  beforeAll(async () => {
    [signer] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const factory = new ContractFactory(
      DefiBridgeProxy.abi,
      DefiBridgeProxy.bytecode,
      signer
    );
    defiBridgeProxy = await factory.deploy([]);
    rollupContract = await RollupProcessor.deploy(signer, [
      defiBridgeProxy.address,
    ]);
    // deploy the bridge and pass in any args
    const args = [
      rollupContract.address,
      trancheFactoryAddress,
      byteCodeHash,
      balancerAddress,
    ];
    elementBridge = await ElementBridge.deploy(signer, args);
  });

  it("should allow us to configure a new pool", async () => {
    const func = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          elementDaiApr2022Spec.poolAddress,
          elementDaiApr2022Spec.wrappedPositionAddress,
          elementDaiApr2022Spec.expiry
        )
        .catch(fixEthersStackTrace);
    };
    await expect(func()).resolves.toBe(undefined);
  });

  it("should allow us to configure the same pool multiple times", async () => {
    const func = async () => {
      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiApr2022Spec.poolAddress,
        elementDaiApr2022Spec.wrappedPositionAddress,
        elementDaiApr2022Spec.expiry
      );

      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiApr2022Spec.poolAddress,
        elementDaiApr2022Spec.wrappedPositionAddress,
        elementDaiApr2022Spec.expiry
      );

      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiApr2022Spec.poolAddress,
        elementDaiApr2022Spec.wrappedPositionAddress,
        elementDaiApr2022Spec.expiry
      );
    };
    await expect(func()).resolves.not.toThrow();
  });

  it("should allow us to configure multiple pools", async () => {
    const func = async () => {
      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiApr2022Spec.poolAddress,
        elementDaiApr2022Spec.wrappedPositionAddress,
        elementDaiApr2022Spec.expiry
      );

      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiJan2022Spec.poolAddress,
        elementDaiJan2022Spec.wrappedPositionAddress,
        elementDaiJan2022Spec.expiry
      );
    };
    await expect(func()).resolves.not.toThrow();
  });

  it("should not allow us to configure wrong expiry", async () => {
    // wrong expiry
    const wrongExpiry = async () => {
      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiApr2022Spec.poolAddress,
        elementDaiApr2022Spec.wrappedPositionAddress,
        elementDaiJan2022Spec.expiry
      );
    };
    await expect(wrongExpiry()).rejects.toThrow("POOL_EXPIRY_MISMATCH");
  });

  it("should not allow us to configure wrong wrapped position", async () => {
    //invalid wrapped position
    const wrongPosition = async () => {
      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiApr2022Spec.poolAddress,
        randomAddress(),
        elementDaiApr2022Spec.expiry
      );
    };
    await expect(wrongPosition()).rejects.toThrow();
  });

  it("should not allow us to configure wrong pool", async () => {
    // // wrong pool
    const wrongPool = async () => {
      await elementBridge.registerConvergentPoolAddress(
        signer,
        elementDaiJan2022Spec.poolAddress,
        elementDaiApr2022Spec.wrappedPositionAddress,
        elementDaiApr2022Spec.expiry
      );
    };
    await expect(wrongPool()).rejects.toThrow("POOL_EXPIRY_MISMATCH");
  });

  it("should not allow us to configure invalid pool", async () => {
    // invalid pool
    const invalidPool = async () => {
      await elementBridge.registerConvergentPoolAddress(
        signer,
        randomAddress(),
        elementDaiApr2022Spec.wrappedPositionAddress,
        elementDaiApr2022Spec.expiry
      );
    };
    await expect(invalidPool()).rejects.toThrow();
  });

  it("should not allow conversion from non ERC20 assets", async () => {
    const inputAsset = {
      assetType: AztecAssetType.VIRTUAL,
      id: 1,
      erc20Address: daiAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;
    const convertFunc = async () => {
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        1n,
        1n,
        BigInt(elementDaiApr2022Spec.expiry)
      );
    };
    await expect(convertFunc()).rejects.toThrow();
  });

  it("should not allow conversion from non ERC20 assets 2", async () => {
    const inputAsset = {
      assetType: AztecAssetType.ETH,
      id: 1,
      erc20Address: daiAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;
    const convertFunc = async () => {
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        1n,
        1n,
        BigInt(elementDaiApr2022Spec.expiry)
      );
    };
    await expect(convertFunc()).rejects.toThrow();
  });

  it("should not allow conversion from non ERC20 assets 3", async () => {
    const inputAsset = {
      assetType: AztecAssetType.NOT_USED,
      id: 1,
      erc20Address: daiAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;
    const convertFunc = async () => {
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        1n,
        1n,
        BigInt(elementDaiApr2022Spec.expiry)
      );
    };
    await expect(convertFunc()).rejects.toThrow();
  });

  it("should reject input and output assets being different", async () => {
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: daiAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;
    const convertFunc = async () => {
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        1n,
        1n,
        BigInt(elementDaiApr2022Spec.expiry)
      );
    };
    await expect(convertFunc()).rejects.toThrow();
  });

  it("should take DAI and swap for ePyDAI via the bridge for the given expiry in the aux data", async () => {
    const contractSpec = elementDaiApr2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    const interactionNonce = 1n;
    // get 1 DAI into the rollup contract
    const daiAsset = assetSpecs.specs.get("dai")!;
    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: contractSpec.underlyingAddress,
      amount: quantityOfDaiToDeposit,
      name: "dai",
    });

    const register = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          contractSpec.poolAddress,
          contractSpec.wrappedPositionAddress,
          contractSpec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    await expect(register()).resolves.not.toThrow();

    // measure the quantities of DAI and principal tokens in both the bridge contract and the balancer
    const underlyingContract = new Contract(
      contractSpec.underlyingAddress,
      ERC20.abi,
      signer
    );
    const trancheTokenContract = new Contract(
      contractSpec.trancheAddress,
      ERC20.abi,
      signer
    );

    const before = {
      inputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      outputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const { outputValueA, outputValueB, isAsync } =
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        quantityOfDaiToDeposit,
        interactionNonce,
        BigInt(contractSpec.expiry)
      );

    expect(outputValueA).toBe(0n);
    expect(outputValueB).toBe(0n);
    expect(isAsync).toBe(true);

    const after = {
      inputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      outputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    // balancer should have our dai deposit
    expect(after.inputBalancer).toEqual(
      before.inputBalancer + quantityOfDaiToDeposit
    );
    // the increase of principal tokens in the bridge should be the same as the decrease in the balancer
    expect(before.outputBalancer - after.outputBalancer).toEqual(
      after.outputBridge - before.outputBridge
    );
    // no dai should be left in the bridge
    expect(after.inputBridge).toEqual(0n);
  });

  it("should take DAI and swap for ePyDAI via the bridge for the given expiry in the aux data 2", async () => {
    const contractSpec = elementDaiJan2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    const interactionNonce = 1n;
    // get 1 DAI into the rollup contract
    const daiAsset = assetSpecs.specs.get("dai")!;
    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: contractSpec.underlyingAddress,
      amount: quantityOfDaiToDeposit,
      name: "dai",
    });

    const register = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          contractSpec.poolAddress,
          contractSpec.wrappedPositionAddress,
          contractSpec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    await expect(register()).resolves.not.toThrow();

    // measure the quantities of DAI and principal tokens in both the bridge contract and the balancer
    const underlyingContract = new Contract(
      contractSpec.underlyingAddress,
      ERC20.abi,
      signer
    );
    const trancheTokenContract = new Contract(
      contractSpec.trancheAddress,
      ERC20.abi,
      signer
    );

    const before = {
      inputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      outputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const { outputValueA, outputValueB, isAsync } =
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        quantityOfDaiToDeposit,
        interactionNonce,
        BigInt(contractSpec.expiry)
      );

    expect(outputValueA).toBe(0n);
    expect(outputValueB).toBe(0n);
    expect(isAsync).toBe(true);

    const after = {
      inputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      outputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    // balancer should have our dai deposit
    expect(after.inputBalancer).toEqual(
      before.inputBalancer + quantityOfDaiToDeposit
    );
    // the increase of principal tokens in the bridge should be the same as the decrease in the balancer
    expect(before.outputBalancer - after.outputBalancer).toEqual(
      after.outputBridge - before.outputBridge
    );
    // no dai should be left in the bridge
    expect(after.inputBridge).toEqual(0n);
  });

  it("should accept multiple deposits", async () => {
    const contractSpec = elementDaiJan2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    // get 1 DAI into the rollup contract
    const daiAsset = assetSpecs.specs.get("dai")!;
    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: contractSpec.underlyingAddress,
      amount: quantityOfDaiToDeposit,
      name: "dai",
    });

    const register = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          contractSpec.poolAddress,
          contractSpec.wrappedPositionAddress,
          contractSpec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    await expect(register()).resolves.not.toThrow();

    // measure the quantities of DAI and principal tokens in both the bridge contract and the balancer
    const underlyingContract = new Contract(
      contractSpec.underlyingAddress,
      ERC20.abi,
      signer
    );
    const trancheTokenContract = new Contract(
      contractSpec.trancheAddress,
      ERC20.abi,
      signer
    );

    const before = {
      inputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      outputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const result1 = await rollupContract.convert(
      signer,
      elementBridge.address,
      inputAsset,
      {},
      outputAsset,
      {},
      quantityOfDaiToDeposit / 2n,
      1n,
      BigInt(contractSpec.expiry)
    );

    expect(result1.outputValueA).toBe(0n);
    expect(result1.outputValueB).toBe(0n);
    expect(result1.isAsync).toBe(true);

    // second deposit
    const result2 = await rollupContract.convert(
      signer,
      elementBridge.address,
      inputAsset,
      {},
      outputAsset,
      {},
      quantityOfDaiToDeposit / 2n,
      2n,
      BigInt(contractSpec.expiry)
    );

    expect(result2.outputValueA).toBe(0n);
    expect(result2.outputValueB).toBe(0n);
    expect(result2.isAsync).toBe(true);

    const after = {
      inputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      outputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    // balancer should have our dai deposit
    expect(after.inputBalancer).toEqual(
      before.inputBalancer + quantityOfDaiToDeposit
    );
    // the increase of principal tokens in the bridge should be the same as the decrease in the balancer
    expect(before.outputBalancer - after.outputBalancer).toEqual(
      after.outputBridge - before.outputBridge
    );
    // no dai should be left in the bridge
    expect(after.inputBridge).toEqual(0n);
  });

  it("should reject duplicate nonce", async () => {
    const contractSpec = elementDaiJan2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    // get 1 DAI into the rollup contract
    const daiAsset = assetSpecs.specs.get("dai")!;
    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: contractSpec.underlyingAddress,
      amount: quantityOfDaiToDeposit,
      name: "dai",
    });

    const register = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          contractSpec.poolAddress,
          contractSpec.wrappedPositionAddress,
          contractSpec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    await expect(register()).resolves.not.toThrow();

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const convert = async (nonce: bigint) => {
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        quantityOfDaiToDeposit / 2n,
        nonce,
        BigInt(contractSpec.expiry)
      );
    };

    await expect(convert(1n)).resolves.not.toThrow();
    // second call with same nonce should fail
    await expect(convert(1n)).rejects.toThrow("INTERACTION_ALREADY_EXISTS");
  });

  it("should inform that interaction is not ready to be finalised", async () => {
    const contractSpec = elementDaiApr2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    const interactionNonce = 1n;
    // get 1 DAI into the rollup contract
    const daiAsset = assetSpecs.specs.get("dai")!;
    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: contractSpec.underlyingAddress,
      amount: quantityOfDaiToDeposit,
      name: "dai",
    });

    const register = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          contractSpec.poolAddress,
          contractSpec.wrappedPositionAddress,
          contractSpec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    await expect(register()).resolves.not.toThrow();

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const { outputValueA, outputValueB, isAsync } =
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        quantityOfDaiToDeposit,
        interactionNonce,
        BigInt(contractSpec.expiry)
      );

    expect(outputValueA).toBe(0n);
    expect(outputValueB).toBe(0n);
    expect(isAsync).toBe(true);

    const canFinalise = await elementBridge.canFinalise(1n);
    expect(canFinalise).toEqual(false);
  });

  it("should reject can finalise on non-existent nonce", async () => {
    const finalise = async () => {
      await elementBridge.canFinalise(100n);
    };
    await expect(finalise()).rejects.toThrow("UNKNOWN_NONCE");
  });

  it("should reject finalise on non-existent nonce", async () => {
    const contractSpec = elementDaiApr2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    const interactionNonce = 1n;

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const finalise = async () => {
      await rollupContract.processAsyncDefiInteraction(
        signer,
        interactionNonce
      );
    };
    await expect(finalise()).rejects.toThrow("UNKNOWN_NONCE");
  });

  it("should reject finalising interaction before it is ready", async () => {
    const contractSpec = elementDaiApr2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    const interactionNonce = 1n;
    // get 1 DAI into the rollup contract
    // get 1 DAI into the rollup contract
    const daiAsset = assetSpecs.specs.get("dai")!;
    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: contractSpec.underlyingAddress,
      amount: quantityOfDaiToDeposit,
      name: "dai",
    });

    const register = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          contractSpec.poolAddress,
          contractSpec.wrappedPositionAddress,
          contractSpec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    await expect(register()).resolves.not.toThrow();

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const { outputValueA, outputValueB, isAsync } =
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        quantityOfDaiToDeposit,
        interactionNonce,
        BigInt(contractSpec.expiry)
      );

    expect(outputValueA).toBe(0n);
    expect(outputValueB).toBe(0n);
    expect(isAsync).toBe(true);

    const finalise = async () => {
      await rollupContract.processAsyncDefiInteraction(
        signer,
        interactionNonce
      );
    };
    await expect(finalise()).rejects.toThrow("BRIDGE_NOT_READY");
  });

  it("finalising interaction should succeed once term is reached", async () => {
    const contractSpec = elementDaiApr2022Spec;

    const quantityOfDaiToDeposit = 1n * 10n ** 21n;
    const interactionNonce = 68n;
    // get 1 DAI into the rollup contract
    const daiAsset = assetSpecs.specs.get("dai")!;
    await rollupContract.preFundContractWithToken(signer, {
      erc20Address: contractSpec.underlyingAddress,
      amount: quantityOfDaiToDeposit,
      name: "dai",
    });

    const register = async () => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          contractSpec.poolAddress,
          contractSpec.wrappedPositionAddress,
          contractSpec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    await expect(register()).resolves.not.toThrow();

    // for the element bridge, input assets and output assets are the same
    const inputAsset = {
      assetType: AztecAssetType.ERC20,
      id: 1,
      erc20Address: contractSpec.underlyingAddress,
    } as AztecAsset;
    const outputAsset = inputAsset;

    const trancheTokenContract = new Contract(
      contractSpec.trancheAddress,
      ERC20.abi,
      signer
    );

    const underlyingContract = new Contract(
      contractSpec.underlyingAddress,
      ERC20.abi,
      signer
    );

    const { outputValueA, outputValueB, isAsync } =
      await rollupContract.convert(
        signer,
        elementBridge.address,
        inputAsset,
        {},
        outputAsset,
        {},
        quantityOfDaiToDeposit,
        interactionNonce,
        BigInt(contractSpec.expiry)
      );

    expect(outputValueA).toBe(0n);
    expect(outputValueB).toBe(0n);
    expect(isAsync).toBe(true);

    const before = {
      outputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      inputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timeIncrease = contractSpec.expiry - blockBefore.timestamp;

    await ethers.provider.send("evm_increaseTime", [timeIncrease]);
    await ethers.provider.send("evm_mine", []);

    await expect(elementBridge.canFinalise(interactionNonce)).resolves.toBe(
      true
    );

    const result = await rollupContract.processAsyncDefiInteraction(
      signer,
      interactionNonce
    );

    const after = {
      outputBalancer: BigInt(
        await underlyingContract.balanceOf(balancerAddress)
      ),
      outputBridge: BigInt(
        await underlyingContract.balanceOf(elementBridge.address)
      ),
      inputBalancer: BigInt(
        await trancheTokenContract.balanceOf(balancerAddress)
      ),
      inputBridge: BigInt(
        await trancheTokenContract.balanceOf(elementBridge.address)
      ),
    } as SwapQuantities;

    expect(after.inputBridge).toBe(0n);
    expect(after.outputBridge - before.inputBridge).toBeLessThan(1000n); // account for small slippage

    await expect(elementBridge.canFinalise(interactionNonce)).resolves.toBe(
      false
    );
  });

  it("all assets and all expiries", async () => {
    const tokens = vaultConfig.tokens;

    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const currentTime = blockBefore.timestamp;
    console.log(`Current time: ${currentTime}`);
    let goodSpecs: ElementPoolSpec[] = [];
    const failedSpecs: ElementPoolSpec[] = [];
    const assetNames = Object.keys(tokens);
    for (let i = 0; i < assetNames.length; i++) {
      const assetName = assetNames[i];
      if (assetSpecs.specs.has(assetName)) {
        const assetSpec = assetSpecs.specs.get(assetName)!;
        if (assetSpec.disabled) {
          continue;
        }
        const requiredToken = {
          amount: 10n * 10n ** assetSpec.quantityExponent,
          erc20Address: tokens[assetName],
          name: assetName,
        };
        try {
          await rollupContract.preFundContractWithToken(signer, requiredToken);
          goodSpecs.push(...buildPoolSpecs(assetName, vaultConfig));
        } catch (e) {
          console.log(
            `Failed to fund rollup with ${requiredToken.amount} tokens of ${requiredToken.name}`,
            e
          );
          failedSpecs.push(...buildPoolSpecs(assetName, vaultConfig));
        }
      }
    }

    const register = async (spec: ElementPoolSpec) => {
      await elementBridge
        .registerConvergentPoolAddress(
          signer,
          spec.poolAddress,
          spec.wrappedPositionAddress,
          spec.expiry
        )
        .catch(fixEthersStackTrace);
    };

    const tempSpecs: ElementPoolSpec[] = [];
    for (let i = 0; i < goodSpecs.length; i++) {
      const currentSpec = goodSpecs[i];
      if (currentSpec.expiry <= currentTime) {
        failedSpecs.push(currentSpec);
        continue;
      }
      try {
        await register(currentSpec);
        tempSpecs.push(currentSpec);
        console.log(
          `Successfully registered ${currentSpec.name}: ${new Date(
            currentSpec.expiry * 1000
          )}`
        );
      } catch (e) {
        console.log(
          `Failed to register ${currentSpec.name}: ${new Date(
            currentSpec.expiry * 1000
          )}`
        );
        failedSpecs.push(currentSpec);
      }
    }

    goodSpecs = tempSpecs;

    const beforeQuantities: SwapQuantities[] = [];

    for (let i = 0; i < goodSpecs.length; i++) {
      const currentSpec = goodSpecs[i];
      const inputAsset = {
        assetType: AztecAssetType.ERC20,
        id: 1,
        erc20Address: currentSpec.underlyingAddress,
      } as AztecAsset;
      const outputAsset = inputAsset;
      const name = currentSpec.name;

      const trancheTokenContract = new Contract(
        currentSpec.trancheAddress,
        ERC20.abi,
        signer
      );

      const underlyingContract = new Contract(
        currentSpec.underlyingAddress,
        ERC20.abi,
        signer
      );

      const before = {
        outputBalancer: BigInt(
          await underlyingContract.balanceOf(balancerAddress)
        ),
        outputBridge: BigInt(
          await underlyingContract.balanceOf(elementBridge.address)
        ),
        inputBalancer: BigInt(
          await trancheTokenContract.balanceOf(balancerAddress)
        ),
        inputBridge: BigInt(
          await trancheTokenContract.balanceOf(elementBridge.address)
        ),
      } as SwapQuantities;
      beforeQuantities.push(before);
      const quantity =
        BigInt(await underlyingContract.balanceOf(rollupContract.address)) /
        10n;

      console.log(
        `Attempting to deposit ${quantity} of ${currentSpec.name}: ${new Date(
          currentSpec.expiry * 1000
        )}`
      );

      const { outputValueA, outputValueB, isAsync } =
        await rollupContract.convert(
          signer,
          elementBridge.address,
          inputAsset,
          {},
          outputAsset,
          {},
          quantity,
          BigInt(i + 1),
          BigInt(currentSpec.expiry)
        );
      console.log(
        `Successfully deposited ${quantity} of ${currentSpec.name}: ${new Date(
          currentSpec.expiry * 1000
        )}`
      );

      expect(outputValueA).toBe(0n);
      expect(outputValueB).toBe(0n);
      expect(isAsync).toBe(true);
    }

    expect(goodSpecs.length).toBeTruthy();
    const maxExpiry = goodSpecs.map((x) => x.expiry).sort()[
      goodSpecs.length - 1
    ];
    console.log(`Max expiry ${maxExpiry}`);
    const timeIncrease = maxExpiry - blockBefore.timestamp;

    await ethers.provider.send("evm_increaseTime", [timeIncrease]);
    await ethers.provider.send("evm_mine", []);

    for (let i = 0; i < goodSpecs.length; i++) {
      const currentSpec = goodSpecs[i];
      const interactionNonce = BigInt(i + 1);

      const trancheTokenContract = new Contract(
        currentSpec.trancheAddress,
        ERC20.abi,
        signer
      );

      const underlyingContract = new Contract(
        currentSpec.underlyingAddress,
        ERC20.abi,
        signer
      );

      console.log(
        `Finalising deposit of ${currentSpec.name}: ${new Date(
          currentSpec.expiry * 1000
        )}`
      );

      await expect(elementBridge.canFinalise(interactionNonce)).resolves.toBe(
        true
      );

      const result = await rollupContract.processAsyncDefiInteraction(
        signer,
        interactionNonce
      );

      const after = {
        outputBalancer: BigInt(
          await underlyingContract.balanceOf(balancerAddress)
        ),
        outputBridge: BigInt(
          await underlyingContract.balanceOf(elementBridge.address)
        ),
        inputBalancer: BigInt(
          await trancheTokenContract.balanceOf(balancerAddress)
        ),
        inputBridge: BigInt(
          await trancheTokenContract.balanceOf(elementBridge.address)
        ),
      } as SwapQuantities;

      expect(after.inputBridge).toBe(0n);
      expect(after.outputBridge - beforeQuantities[i].inputBridge).toBeLessThan(
        1000n
      ); // account for small slippage

      await expect(elementBridge.canFinalise(interactionNonce)).resolves.toBe(
        false
      );
    }
  });
});
