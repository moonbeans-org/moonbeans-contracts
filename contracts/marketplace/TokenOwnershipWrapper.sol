//Custom contract wrapping the IERC721-enumerable tokensOfOwnerByIndex function, with the ability to get an array of owned NFTs.

pragma solidity ^0.8.4;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

contract TokenOwnershipWrapper {

  function tokensOfOwner(address _owner, address _contract) external view returns (uint256[] memory) {
    IERC721Enumerable nft = IERC721Enumerable(_contract);
    uint256 tokenCount = nft.balanceOf(_owner);
    if (tokenCount == 0) {
      // Return an empty array
      return new uint256[](0);
    } else {
      uint256[] memory result = new uint256[](tokenCount);
      uint256 index;
      for (index = 0; index < tokenCount; index++) {
        result[index] = nft.tokenOfOwnerByIndex(_owner, index);
      }
      return result;
    }
  }

}