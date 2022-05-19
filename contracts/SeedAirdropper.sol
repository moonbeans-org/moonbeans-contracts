pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SeedAirdropper is Ownable {

    IERC20 BABYBEANS = IERC20(0xC0FC9E41C84803fcE8A54Ca8bEcb73cEC3E9A533);
    IERC20 MOONSEEDS = IERC20(0xD5059D18A77b3fdFA524eF3Dfc03FeF63165C908);

    function airdrop(address[] memory bbHolders) external onlyOwner {
        for (uint i; i < bbHolders.length; i++) {
            MOONSEEDS.transferFrom(msg.sender, bbHolders[i], BABYBEANS.balanceOf(bbHolders[i]));
        }
    }
}