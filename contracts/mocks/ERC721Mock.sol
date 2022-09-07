pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ERC721Mock is ERC721 {
    constructor() 
    ERC721("Dummy NFT", "DUMMY") 
    {}

    uint256 totalSupply;

    function mint(address to, uint256 amount) external {
        uint256 nextToken = totalSupply + 1;
        for(uint i; i<amount; i++) {
            _mint(to, nextToken+i);
        }
    }
}
