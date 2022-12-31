pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
// import "hardhat/console.sol";

contract ERC1155Mock is ERC1155 {
    constructor() 
    ERC1155("dummy.ipfs") 
    {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}
