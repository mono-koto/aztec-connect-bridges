import { ethers, network } from "hardhat";
import { ERC20 } from "../../../../typechain-types";

export async function fundERC20FromAccount(erc20: ERC20, from: string, to: string, amount: bigint) {
  await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [from],
  });
  const holder = await ethers.getSigner(from);
  await erc20.connect(holder).transfer(to, amount);
  await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [from],
  });
}

export async function contractHasMethod(address: string, sig: string) {
  const funcSelector = ethers.utils.id(sig).slice(2, 10); 
  const bytecode = await ethers.provider.getCode(address);
  return bytecode.includes(funcSelector);
}