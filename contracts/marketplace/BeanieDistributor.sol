pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract BeanieDistributor is IERC721Receiver, ReentrancyGuard, Ownable {

  address public TOKEN = 0x722E8BdD2ce80A4422E880164f2079488e115365; //WETH, NOVA
  uint256 public allTimeBalance = 0;
  uint256 tokenAllTimeBalance = 0;
  uint256 lastTokenBalance = 0;
  uint256 totalTokenClaimed = 0;
  uint256 public constant NUM_BEANIES = 462;
  mapping(uint256 => uint256) claimed;
  mapping(uint256 => uint256) tokenClaimed;
  mapping(address => bool) administrators;

  receive() external payable {
    allTimeBalance += msg.value;
    uint256 currentTokenBalance = IERC20(TOKEN).balanceOf(address(this));
    if (currentTokenBalance + totalTokenClaimed > lastTokenBalance) {
      tokenAllTimeBalance += ((currentTokenBalance + totalTokenClaimed) - lastTokenBalance);
    }
    lastTokenBalance = currentTokenBalance;
  }

  modifier onlyAdmins() {
      require(msg.sender == owner() || administrators[msg.sender]);
      _;
  }

  // Required in order to receive ERC 721's.
  function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
    return this.onERC721Received.selector;
  }


  // GLMR
  function getClaimable(uint256 tokenId) public view returns (uint256) {
    uint256 allTimeShare = allTimeBalance / NUM_BEANIES;
    return allTimeShare - claimed[tokenId];
  }

  function claim(address payable beanieOwner, uint256 tokenId) external onlyAdmins {
    uint256 claimable = getClaimable(tokenId);
    if (claimable != 0) {
        claimed[tokenId] += claimable;
        (bool success, ) = beanieOwner.call{value: claimable}("");
        require(success, "failed claim");
    }
  }

  function claimForAll(address payable beanieOwner, uint256[] memory ownedTokens) external onlyAdmins {
    uint256 totalAmountToSend = 0;
    for (uint i = 0; i < ownedTokens.length; i++) {
        uint256 claimable = getClaimable(ownedTokens[i]);
        claimed[ownedTokens[i]] += claimable;
        totalAmountToSend += claimable;
    }
    require(totalAmountToSend != 0, "no rewards");
    (bool success, ) = beanieOwner.call{value: totalAmountToSend}("");
    require(success, "failed claim");
  }


  

  //WGLMR
  function getClaimableToken(uint256 tokenId) public view returns (uint256) {
    uint256 allTimeShare = tokenAllTimeBalance / NUM_BEANIES;
    return allTimeShare - tokenClaimed[tokenId];
  }

  function claimToken(address payable beanieOwner, uint256 tokenId) external onlyAdmins {
    uint256 claimable = getClaimableToken(tokenId);
    tokenClaimed[tokenId] += claimable;
    totalTokenClaimed += claimable;
    IERC20(TOKEN).transferFrom(address(this), beanieOwner, claimable);
  }

  function claimTokenForAll(address payable beanieOwner, uint256[] memory ownedTokens) external onlyAdmins{
    uint256 totalAmountToSend = 0;
    for (uint i = 0; i < ownedTokens.length; i++) {
        uint256 claimable = getClaimableToken(ownedTokens[i]);
        tokenClaimed[ownedTokens[i]] += claimable;
        totalAmountToSend += claimable;
    }
    require(totalAmountToSend != 0, "no rewards");
    totalTokenClaimed += totalAmountToSend;
    IERC20(TOKEN).transferFrom(address(this), beanieOwner, totalAmountToSend);
  }
  

  // Emergency only - Recover Tokens
  function recoverToken(address _token, uint256 amount) external onlyOwner {
    IERC20(_token).transfer(owner(), amount);
  }

  // Emergency only - Recover NFTs
  function recoverNFT(address _token, uint256 tokenId) external onlyOwner {
    IERC721(_token).transferFrom(address(this), owner(), tokenId);
  }

  // Emergency only - Recover MOVR
  function RecoverGLMR(address to, uint256 amount) external onlyOwner {
    payable(to).transfer(amount);
  }

  function setToken(address _token) external onlyOwner {
      TOKEN = _token;
  }

  function flipAdmin(address _admin) external onlyOwner {
      administrators[_admin] = !administrators[_admin];
  }
}
