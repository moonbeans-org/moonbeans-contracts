// Handles Storefront Ownership

pragma solidity ^0.8.9;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";

contract StorefrontOwnership is Ownable {

    mapping(bytes32 => address) public storefrontOwners;
    mapping(address => bool) public administrators;
    address public DEFAULT_OWNER;

    constructor() {
        DEFAULT_OWNER = owner();
    }

    //By default, set the storefront owner to the BEANS admin.
    function getStorefrontOwner(string memory storefrontId) public view returns (address) {
        bytes32 id = keccak256(abi.encodePacked(storefrontId));
        return storefrontOwners[id] == 0x0000000000000000000000000000000000000000 ? DEFAULT_OWNER : storefrontOwners[id];
    }

    function setStorefrontOwner(string memory storefrontId, address storefrontOwner) public {
        require(msg.sender == owner() || administrators[msg.sender], "Not authorized.");
        bytes32 id = keccak256(abi.encodePacked(storefrontId));
        storefrontOwners[id] = storefrontOwner;
    }

    function flipAdmin(address adminAddress) external onlyOwner {
        administrators[adminAddress] = !administrators[adminAddress];
    }

}