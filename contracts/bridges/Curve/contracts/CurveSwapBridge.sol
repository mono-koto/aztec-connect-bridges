// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IDefiBridge } from "../../../interfaces/IDefiBridge.sol";
import { IWETH } from "../../../interfaces/IWETH.sol";
import { ICurveProvider } from "../../../interfaces/ICurveProvider.sol";
import { ICurveExchange } from "../../../interfaces/ICurveExchange.sol";

import { AztecTypes } from "../../../AztecTypes.sol";

import "hardhat/console.sol";

contract CurveSwapBridge is IDefiBridge {
    uint256 private constant CURVE_SWAPS_ADDRESS_INDEX = 2;

    address public immutable rollupProcessor;
    IWETH public immutable weth;
    ICurveProvider public curveAddressProvider;

    constructor(
        address _rollupProcessor,
        address _addressProvider,
        address _weth
    ) {
        rollupProcessor = _rollupProcessor;
        curveAddressProvider = ICurveProvider(_addressProvider);
        weth = IWETH(_weth);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

  function convert(
    AztecTypes.AztecAsset calldata inputAssetA,
    AztecTypes.AztecAsset calldata,
    AztecTypes.AztecAsset calldata outputAssetA,
    AztecTypes.AztecAsset calldata,
    uint256 inputValue,
    uint256,
    uint64
  )
    external
    payable
    returns (
      uint256 outputValueA,
      uint256 outputValueB,
      bool isAsync
    )
    {
        require(msg.sender == rollupProcessor, "INVALID_CALLER");
        require(
            inputAssetA.assetType == AztecTypes.AztecAssetType.ERC20 || inputAssetA.assetType == AztecTypes.AztecAssetType.ETH,
            "INVALID_INPUT_ASSET_TYPE"
        );
        require(inputAssetA.assetType != AztecTypes.AztecAssetType.ETH || msg.value == inputValue, "INVALID_ETH_VALUE");
        require(
            outputAssetA.assetType == AztecTypes.AztecAssetType.ERC20 || outputAssetA.assetType == AztecTypes.AztecAssetType.ETH,
            "INVALID_OUTPUT_ASSET_TYPE"
        );

        outputValueA = _convert(inputAssetA, outputAssetA, inputValue);
        outputValueB = 0;
        isAsync = false;
    }

    function _convert(
        AztecTypes.AztecAsset calldata input,
        AztecTypes.AztecAsset calldata output,
        uint256 inputValue
    ) internal returns (uint256) {
        address inputAddr;
        if (input.assetType == AztecTypes.AztecAssetType.ETH) {
            weth.deposit{ value: msg.value }();
            inputAddr = address(weth);
        } else {
            inputAddr = input.erc20Address;
        }

        address outputAddr;
        if (output.assetType == AztecTypes.AztecAssetType.ETH) {
            outputAddr = address(weth);
        } else {
            outputAddr = output.erc20Address;
        }

        // Grab the Curve Exchange
        ICurveExchange curveExchange = ICurveExchange(curveAddressProvider.get_address(CURVE_SWAPS_ADDRESS_INDEX));
        require(IERC20(inputAddr).approve(address(curveExchange), inputValue), "ERC20_APPROVE_FAILED");

        address pool;
        uint256 rate;
        (pool, rate) = curveExchange.get_best_rate(inputAddr, outputAddr, inputValue);

        // TODO - include slippage via aux data?
        // uint256 expectedAmount = curveExchange.get_exchange_amount(pool, inputAddr, outputAddr, inputValue);

        uint256 resultAmount = curveExchange.exchange(pool, inputAddr, outputAddr, inputValue, 0);

        if (output.assetType == AztecTypes.AztecAssetType.ETH) {
            weth.withdraw(resultAmount);
            (bool success, ) = rollupProcessor.call{ value: resultAmount }("");
            require(success, "ETH_TRANFER_FAIL");
        } else if (output.assetType == AztecTypes.AztecAssetType.ERC20) {
            IERC20(outputAddr).transfer(address(rollupProcessor), resultAmount);
        }

        return resultAmount;
    }

    function canFinalise(uint256) external pure override returns (bool) {
        return false;
    }

    function finalise(
        AztecTypes.AztecAsset calldata,
        AztecTypes.AztecAsset calldata,
        AztecTypes.AztecAsset calldata,
        AztecTypes.AztecAsset calldata,
        uint256,
        uint64
    ) external payable override returns (uint256, uint256) {
        require(false, "FINALISE_UNSUPPORTED");
        return (0, 0);
    }
}
