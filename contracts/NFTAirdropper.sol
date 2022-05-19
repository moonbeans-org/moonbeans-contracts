pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTAirdropper is Ownable {

    IERC721 BEANIEBUDS = IERC721(0x28E0A6c52707D8225ff9b15D85A4dDaeA7352E5d);

    function airdrop(address[] memory wallets, uint256 startIndex) external onlyOwner {
        for (uint i; i < wallets.length;) {
            BEANIEBUDS.transferFrom(msg.sender, wallets[i], startIndex + i);
            unchecked {
                ++i;
            }
        }
    }
}