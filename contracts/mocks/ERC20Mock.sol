pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract ERC20Mock is ERC20 {
    constructor() 
    ERC20("Dummy 20", "DUM20") 
    {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
