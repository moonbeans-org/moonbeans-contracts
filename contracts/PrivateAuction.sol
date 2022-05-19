//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.4;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PrivateAuction is IERC721Receiver, ReentrancyGuard, Ownable {

  event BidPlaced(uint256 indexed id, uint256 indexed price, address indexed bidder, uint256 timestamp);
  event BidAccepted(uint256 indexed id, uint256 indexed price, address indexed bidder, uint256 timestamp);
  event BidReturned(uint256 indexed id, uint256 indexed price, address indexed bidder, uint256 timestamp);
  
  struct Offer {
    uint256 price;
    uint256 timestamp;
    bool fundsEscrowed;
    bool accepted;
    address bidder;
  }

  bool public allAuctionsPaused = true;
  mapping(uint256 => bool) public itemAuctionPaused;
  mapping(uint256 => bool) public itemAuctionCompleted;
  mapping(uint256 => Offer[]) public offers;
  mapping(address => bool) public administrators;
  mapping(address => uint256) public escrowed; 
  IERC721 public NFT;

  uint256 private startingBid = 1000 ether;
  uint256 private maxBids = 10;
  address private deadAddress = 0x000000000000000000000000000000000000dEaD;

  modifier onlyAdmins {
    require(administrators[_msgSender()] || owner() == _msgSender(), "Not owner or admin.");
    _;
  }

  // Required in order to receive ERC 721's.
  function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
    return this.onERC721Received.selector;
  }

  // Required in order to receive MOVR/ETH.
  receive() external payable { }

  function getAuctionDetails(uint256 itemId) external view returns (Offer[] memory) {
    return offers[itemId];
  }

  function highestBid(uint256 itemId) public view returns (Offer memory) {
    if (offers[itemId].length == 0) {
      return Offer(startingBid, 0, false, false, deadAddress);
    }
    return offers[itemId][offers[itemId].length - 1];
  }

  function secondHighestBid(uint256 itemId) internal view returns (Offer memory) {
    return offers[itemId][offers[itemId].length - 2];
  }

  function highestBidAmount(uint256 itemId) public view returns (uint256) {
    return highestBid(itemId).price;
  }
  
  function placeBid(uint256 itemId) public payable nonReentrant{
    require(!allAuctionsPaused, "Auctions Disabled.");
    require(!itemAuctionPaused[itemId], "Auction Paused.");
    require(!itemAuctionCompleted[itemId], "Auction completed");
    require(msg.value > highestBidAmount(itemId), "Bid too low.");

    // add new offer to array
    escrowed[msg.sender] += msg.value;
    offers[itemId].push(Offer(msg.value, block.timestamp, true, false, msg.sender));
    emit BidPlaced(itemId, msg.value, msg.sender, block.timestamp);
     
    // we don't want to hold onto too many bids
    if (offers[itemId].length >= maxBids) {
      for (uint i = 0; i < offers[itemId].length - 1;) {
        offers[itemId][i] = offers[itemId][i + 1];
        unchecked {++i;}
      }
      offers[itemId].pop();
    }

    // if there's at least 2 bids now, refund the second highest bid.
    if (offers[itemId].length > 1) {
      Offer memory secondHighestOffer = secondHighestBid(itemId);
      emit BidReturned(itemId, secondHighestOffer.price, secondHighestOffer.bidder, secondHighestOffer.timestamp);
      if (escrowed[secondHighestOffer.bidder] >= secondHighestOffer.price) {
        escrowed[secondHighestOffer.bidder] -= secondHighestOffer.price;
        (bool success, ) = payable(secondHighestOffer.bidder).call{value: secondHighestOffer.price}("");
        require(success, "Escrow return failed.");
      }
    }
  }

  //ADMINS
  function flipAdmin(address user) external onlyOwner {
    administrators[user] = !administrators[user];
  }

  function flipAllBidding() external onlyAdmins {
    allAuctionsPaused = !allAuctionsPaused;
  }

  function setMaxBids(uint256 newMax) external onlyAdmins {
    maxBids = newMax;
  }

  function flipAuction(uint256 itemId) external onlyAdmins {
    require(!itemAuctionCompleted[itemId], "Auction completed.");
    itemAuctionPaused[itemId] = !itemAuctionPaused[itemId];
  }

  function setStartingBid(uint256 _startingBid) external onlyAdmins {
    startingBid = _startingBid;
  }

  function setNFTContract(address ca) external onlyAdmins {
    NFT = IERC721(ca);
  }

  function withdrawAmount(uint256 amount) internal {
    payable(owner()).transfer(amount);
  }

  function end(uint256 itemId) external onlyAdmins {
    require(itemAuctionCompleted[itemId] == false, "Auction already completed.");
    require(offers[itemId].length >= 1, "No bids made.");

    // Get highest bid and emit event
    itemAuctionPaused[itemId] = true;
    itemAuctionCompleted[itemId] = true;
    Offer memory acceptedOffer = highestBid(itemId);
    emit BidAccepted(itemId, acceptedOffer.price, acceptedOffer.bidder, acceptedOffer.timestamp);

    // Mark as accepted and send funds to owner
    acceptedOffer.accepted = true;
    uint256 acceptedOfferIndex = offers[itemId].length - 1;
    offers[itemId][acceptedOfferIndex] = acceptedOffer;
  }

  function finalizeAuctionAndSendOut(uint256 itemId) external onlyAdmins {
    require(itemAuctionCompleted[itemId] == false, "Auction already completed.");
    require(offers[itemId].length >= 1, "No bids made.");

    // Get highest bid and emit event
    itemAuctionPaused[itemId] = true;
    itemAuctionCompleted[itemId] = true;
    Offer memory acceptedOffer = highestBid(itemId);
    emit BidAccepted(itemId, acceptedOffer.price, acceptedOffer.bidder, acceptedOffer.timestamp);

    // Mark as accepted and send funds to owner
    acceptedOffer.accepted = true;
    uint256 acceptedOfferIndex = offers[itemId].length - 1;
    offers[itemId][acceptedOfferIndex] = acceptedOffer;
    withdrawAmount(acceptedOffer.price);

    // Transfer winner NFT to winner
    NFT.transferFrom(address(this), acceptedOffer.bidder, itemId);
  }


  //EMERGENCY ONLY
  function withdrawAll() external onlyAdmins {
    payable(owner()).transfer(address(this).balance);
  }

  function withdrawTokens(address token) external onlyAdmins {
    IERC20(token).transfer(owner(), IERC20(token).balanceOf(address(this)));
  }

  function withdrawNFT(address _token, uint256 tokenId) external onlyOwner {
    IERC721(_token).transferFrom(address(this), owner(), tokenId);
  }

}