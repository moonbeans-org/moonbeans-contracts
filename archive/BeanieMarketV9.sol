//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract MarketPlace is IERC721Receiver, ReentrancyGuard, Ownable {

  event TokenListed(address indexed token, uint256 indexed id, uint256 indexed price, uint256 timestamp);
  event TokenDelisted(address indexed token, uint256 indexed id, uint256 timestamp);
  event TokenPurchased(address indexed oldOwner, address indexed newOwner, uint256 indexed price, address collection, uint256 tokenId);
  event BidPlaced(address indexed token, uint256 indexed id, uint256 indexed price, address buyer, uint256 timestamp, bool escrowed);
  event BidCancelled(address indexed token, uint256 indexed id, uint256 indexed price, address buyer, bool escrowed, uint256 timestamp);
  event EscrowReturned(address indexed user, uint256 indexed price);

  // Fees are out of 1000, to theoretically allow for 0.1 - 0.9% fees in the future.
  uint256 public devFee = 10; //1%
  uint256 public beanieHolderFee = 10; //1%
  uint256 public beanBuybackFee = 10; //1%
  uint256 public defaultCollectionOwnerFee = 0; //0%
  uint256 public totalEscrowedAmount = 0;
  uint256 public specialTaxGas = 100000;

  address public TOKEN = 0xAcc15dC74880C9944775448304B263D191c6077F; //WGLMR
  address public devAddress = 0x24312a0b911fE2199fbea92efab55e2ECCeC637D;
  address public beanieHolderAddress = 0x6e0fa1dC8E3e6510aeBF14fCa3d83C77a9780ecB;
  address public beanBuybackAddress = 0xE9b8258668E17AFA5D09de9F10381dE5565dbDc0;

  struct Listing {
    uint256 price;
    uint256 timestamp;
    uint256 tokenId;
    bool accepted;
  }

  struct Offer {
    uint256 price;
    uint256 timestamp;
    bool accepted;
    address buyer;
    bool escrowed;
  }

  bool public tradingPaused = false;
  bool public useSuperGasTaxes = false;
  bool public feesOn = true;
  bool public delistAfterAcceptingOffer = true;
  bool public clearBidsAfterAcceptingOffer = false;
  bool public clearBidsAfterFulfillingListing = false;
  bool public collectionOwnersCanSetRoyalties = true;
  mapping(address => bool) collectionTradingEnabled;
  mapping(address => mapping(uint256 => Listing[])) listings;
  mapping(address => mapping(uint256 => Offer[])) offers;
  mapping(address => address) collectionOwners;
  mapping(address => uint256) totalInEscrow;
  mapping(address => uint256) collectionOwnerFees;
  mapping(address => bool) administrators;

  modifier onlyAdmins {
    require(owner() == _msgSender() || administrators[_msgSender()], "Not owner or admin.");
    _;
  }

  // Required in order to receive ERC 721's.
  function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
    return this.onERC721Received.selector;
  }

  // Required in order to receive MOVR/ETH.
  receive() external payable { }



  // LISTINGS
  // Public wrapper around token delisting, requiring ownership to delist.
  function delistToken(address ca, uint256 tokenId) public {
    require(msg.sender == IERC721(ca).ownerOf(tokenId) || administrators[msg.sender], "Only the owner of a token can delist it.");
    _delistToken(ca, tokenId);
  }

  // Returns value in the 'listings' mapping for a specific address + id to the default (0).
  function _delistToken(address ca, uint256 tokenId) private {
    listings[ca][tokenId].push(Listing(0, block.timestamp, tokenId, false));
    emit TokenDelisted(ca, tokenId, block.timestamp);
  }

  // Lists a token at the specified price point.
  function listToken(address ca, uint256 tokenId, uint256 price) public {
    require(msg.sender == IERC721(ca).ownerOf(tokenId), "Only the owner of a token can list it.");
    require(price != 0, "Cannot set price to 0.");
    require(IERC721(ca).isApprovedForAll(msg.sender, address(this)), "Marketplace not approved to handle this users tokens.");
    listings[ca][tokenId].push(Listing(price, block.timestamp, tokenId, false));
    emit TokenListed(ca, tokenId, price, block.timestamp);
  }

  // Check if a token already has any listings.
  function isListed(address ca, uint256 tokenId) public view returns (bool) {
    uint256 index = listings[ca][tokenId].length;
    if (index == 0) {
      return false;
    }
    return listings[ca][tokenId][index - 1].price != 0;
  }

  // Getter for the current asking price on a specific token.
  function getCurrentListingPrice(address ca, uint256 tokenId) public view returns (uint256){
    return getCurrentListing(ca, tokenId).price;
  }

  // Getter for the latest listing on a specific token.
  function getCurrentListing(address ca, uint256 tokenId) public view returns (Listing memory){
    uint256 numListings = getNumberOfListings(ca, tokenId);
    require(numListings != 0, "No listings for this token.");
    return listings[ca][tokenId][numListings-1];
  }

  // Getter for all listings of a unique token.
  function getTokenListingHistory(address ca, uint256 tokenId) external view returns (Listing[] memory) {
    return listings[ca][tokenId];
  }

  // Allows a buyer to buy at the listed price.
  function fulfillListing(address ca, uint256 tokenId) external payable nonReentrant {
    require(!tradingPaused, "Marketplace trading is disabled.");
    require(collectionTradingEnabled[ca], "Trading for this collection is not enabled.");
    uint256 price = getCurrentListingPrice(ca, tokenId);
    require(msg.value >= price, "The amount sent is less than the asking price.");
    require(price != 0, "This token is not currently listed.");

    //get current NFT owner, verify approval
    address payable oldOwner = payable(IERC721(ca).ownerOf(tokenId));
    require(IERC721(ca).isApprovedForAll(oldOwner, address(this)), "Marketplace not approved to transfer this NFT.");

    //get buyer, calculate fees, store seller original balance
    address payable newOwner = payable(msg.sender);
    (uint256 devFeeAmount, uint256 beanieHolderFeeAmount, uint256 beanBuybackFeeAmount, uint256 collectionOwnerFeeAmount, uint256 remainder) = calculateAmounts(ca, price);
    uint256 oldOwnerMovrBalance = oldOwner.balance;

    //swippity swappity
    IERC721(ca).safeTransferFrom(oldOwner, newOwner, tokenId);
    oldOwner.transfer(remainder);

    //Check that all went swimmingly
    require(IERC721(ca).ownerOf(tokenId) == newOwner, "NFT was not successfully transferred.");
    require(oldOwner.balance >= (oldOwnerMovrBalance + remainder), "Funds were not successfully sent.");
    emit TokenPurchased(oldOwner, newOwner, price, ca, tokenId);

    //fees
    if (feesOn) {
      if (useSuperGasTaxes) {
        sendFeeWithExtraGas(beanieHolderAddress, beanieHolderFeeAmount);
        sendFeeWithExtraGas(beanBuybackAddress, beanBuybackFeeAmount);
        sendFeeWithExtraGas(collectionOwners[ca], collectionOwnerFeeAmount);
        sendFeeWithExtraGas(devAddress, devFeeAmount);
      } else {
        payable(collectionOwners[ca]).transfer(collectionOwnerFeeAmount);
        payable(devAddress).transfer(devFeeAmount);
        payable(beanieHolderAddress).transfer(beanieHolderFeeAmount);
        payable(beanBuybackAddress).transfer(beanBuybackFeeAmount);
      }
    }

    markListingAsAccepted(ca, tokenId);
    if (clearBidsAfterFulfillingListing) {
      _clearAllBids(ca, tokenId);
    }
    _delistToken(ca, tokenId);
  }



  // OFFERS
  // Make a standard offer (checks balance of bidder, but does not escrow).
  function makeOffer(address ca, uint256 tokenId, uint256 price) public {
    require(msg.sender != IERC721(ca).ownerOf(tokenId), "Can not bid on your own NFT.");
    require(price != 0, "Cannot bid a price of 0.");
    require(msg.sender.balance >= price, "The buyer does not have enough money to make the bid.");
    require(IERC20(TOKEN).allowance(msg.sender, address(this)) >= price, "Not an escrowed bid; approval required (Default: WMOVR).");
    offers[ca][tokenId].push(Offer(price, block.timestamp, false, msg.sender, false));
    emit BidPlaced(ca, tokenId, price, msg.sender, block.timestamp, false);
  }

  // Make an escrowed offer (checks balance of bidder, then holds the bid in the contract as an escrow).
  function makeEscrowedOffer(address ca, uint256 tokenId, uint256 price) public payable nonReentrant {
    require(msg.sender != IERC721(ca).ownerOf(tokenId), "Can not bid on your own NFT.");
    require(price != 0, "Cannot bid a price of 0.");
    require(msg.value >= price, "The buyer did not send enough money for an escrowed bid.");
    totalEscrowedAmount += msg.value;
    totalInEscrow[msg.sender] += msg.value;

    offers[ca][tokenId].push(Offer(price, block.timestamp, false, msg.sender, true));
    emit BidPlaced(ca, tokenId, price, msg.sender, block.timestamp, true);
  }

  // Cancel an offer (escrowed or not). Could have gas issues if there's too many offers...
  function cancelOffer(address ca, uint256 tokenId, uint256 price, bool escrowed) external nonReentrant {
    Offer[] storage _offers = _getOffers(ca, tokenId);
    for (uint i = 0; i < _offers.length; i++) {
      if (escrowed) {
        if (_offers[i].price == price && _offers[i].buyer == msg.sender && _offers[i].escrowed && !_offers[i].accepted) {
          delete offers[ca][tokenId][i];
          returnEscrowedFunds(msg.sender, price);
          emit BidCancelled(ca, tokenId, price, msg.sender, escrowed, block.timestamp);
          return;
        }
      } else {
        if (_offers[i].price == price && _offers[i].buyer == msg.sender && !_offers[i].escrowed && !_offers[i].accepted) {
          delete offers[ca][tokenId][i];
          emit BidCancelled(ca, tokenId, price, msg.sender, escrowed, block.timestamp);
          return;
        }
      }
    }
    revert('No cancellable offer found.');
  }

  // Getter for all bids on a unique token.
  function getOffers(address ca, uint256 tokenId) external view returns (Offer[] memory) {
    return offers[ca][tokenId];
  }

  // Same as above, but for internal calls/passing offers object by reference.
  function _getOffers(address ca, uint256 tokenId) internal view returns (Offer[] storage) {
    return offers[ca][tokenId];
  }

  // Accept an active offer.
  function acceptOffer(address ca, uint256 tokenId, uint256 price, address from, bool escrowedBid) external nonReentrant {
    IERC721 _nft = IERC721(ca);
    require(msg.sender == _nft.ownerOf(tokenId), "Only the owner of this NFT can accept an offer.");
    require(_nft.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved to transfer this NFT.");
    require(!tradingPaused, "Marketplace trading is disabled.");
    require(collectionTradingEnabled[ca], "Trading for this collection is not enabled.");
    Offer[] storage _offers = _getOffers(ca, tokenId);
    uint256 correctIndex = 999999999999999999;
    for (uint i = _offers.length-1; i >= 0; i--) {
      if (_offers[i].price == price
        && _offers[i].buyer == from
        && _offers[i].accepted == false
        && _offers[i].escrowed == escrowedBid
      ) {
        correctIndex = i;
        break;
      }
    }
    require(correctIndex != 999999999999999999, "Matching offer not found...");

    // Actually perform trade
    address payable oldOwner = payable(address(msg.sender));
    address payable newOwner = payable(address(from));
    if (escrowedBid) {
      escrowedPurchase(_nft, ca, tokenId, price, oldOwner, newOwner);
    } else {
      tokenPurchase(_nft, ca, tokenId, price, oldOwner, newOwner);
    }

    // Clean up data structures
    markOfferAsAccepted(ca, tokenId, correctIndex, _offers[correctIndex]);
    if (clearBidsAfterAcceptingOffer) {
      _clearAllBids(ca, tokenId);
    }
    if(delistAfterAcceptingOffer && isListed(ca, tokenId)) {
      _delistToken(ca, tokenId);
    }
  }



  // PUBLIC ESCROW FUNCTIONS
  function addMoneyToEscrow() external payable nonReentrant {
    require(msg.value >= 10000000 gwei, "Minimum escrow deposit is 0.01 MOVR.");
    totalEscrowedAmount += msg.value;
    totalInEscrow[msg.sender] += msg.value;
  }

  function withdrawMoneyFromEscrow(uint256 amount) external nonReentrant {
    require(totalInEscrow[msg.sender] >= amount, "Trying to withdraw more than deposited.");
    returnEscrowedFunds(msg.sender, amount);
  }

  function getEscrowedAmount(address user) external view returns (uint256) {
    return totalInEscrow[user];
  }



  // OTHER PUBLIC FUNCTIONS
  function getCollectionOwner(address ca) external view returns (address) {
    return collectionOwners[ca];
  }

  function totalFees() public view returns (uint256) {
    return (devFee + beanieHolderFee + beanBuybackFee + defaultCollectionOwnerFee);
  }

  function checkEscrowAmount(address user) external view returns (uint256) {
    return totalInEscrow[user];
  }

  function isCollectionTrading(address ca) external view returns (bool) {
    return collectionTradingEnabled[ca];
  }

  function getCollectionFee(address ca) external view returns (uint256) {
    return collectionOwnerFees[ca];
  }



  // ADMIN FUNCTIONS
  function setAdmin(address admin, bool value) external onlyOwner {
    administrators[admin] = value;
  }

  function setPaymentToken(address _token) external onlyOwner {
    TOKEN = _token;
  }

  function clearAllBids(address ca, uint256 tokenId) external onlyAdmins {
    _clearAllBids(ca, tokenId);
  }

  function clearAllListings(address ca, uint256 tokenId) external onlyAdmins {
    delete listings[ca][tokenId];
  }

  function setTrading(bool value) external onlyOwner {
    require(tradingPaused != value, "Already set to that value.");
    tradingPaused = value;
  }

  function setSuperGasTaxes(bool value) external onlyOwner {
    require(useSuperGasTaxes != value, "Already set to that value.");
    useSuperGasTaxes = value;
  }

  function setCollectionTrading(address ca, bool value) external onlyAdmins {
    require(collectionTradingEnabled[ca] != value, "Already set to that value.");
    collectionTradingEnabled[ca] = value;
  }

  function setCollectionOwner(address ca, address owner) external onlyAdmins {
    collectionOwners[ca] = owner;
  }

  function setDevFee(uint256 fee) external onlyOwner {
    require (fee <= 100, "Max 10% fee");
    devFee = fee;
  }

  function setBeanieHolderFee(uint256 fee) external onlyOwner {
    require (fee <= 100, "Max 10% fee");
    beanieHolderFee = fee;
  }

  function setBeanBuyBackFee(uint256 fee) external onlyOwner {
    require (fee <= 100, "Max 10% fee");
    beanBuybackFee = fee;
  }

  function setCollectionOwnerFee(address ca, uint256 fee) external {
    bool verifiedCollectionOwner = collectionOwnersCanSetRoyalties && (_msgSender() == collectionOwners[ca]);
    require(_msgSender() == owner() || verifiedCollectionOwner);
    require (fee <= 100, "Max 10% fee");
    collectionOwnerFees[ca] = fee;
  }

  function setDefaultCollectionOwnerFee(uint256 fee) external onlyOwner {
    require(fee <= 100, "Max 10% fee");
    defaultCollectionOwnerFee = fee;
  }

  function setDevAddress(address _address) external onlyOwner {
    devAddress = _address;
  }

  function setBeanieHolderAddress(address _address) external onlyOwner {
    beanieHolderAddress = _address;
  }

  function setBeanBuybackAddress(address _address) external onlyOwner {
    beanBuybackAddress = _address;
  }

  function setSpecialGasTax(uint256 gasAmount) external onlyOwner {
    specialTaxGas = gasAmount;
  }

  function setFeesOn(bool _value) external onlyOwner {
    feesOn = _value;
  }

  function setDelistAfterAcceptingOffer(bool _value) external onlyOwner {
    delistAfterAcceptingOffer = _value;
  }

  function setClearBidsAfterAcceptingOffer(bool _value) external onlyOwner {
    clearBidsAfterAcceptingOffer = _value;
  }

  function setClearBidsAfterFulfillingListing(bool _value) external onlyOwner {
    clearBidsAfterFulfillingListing = _value;
  }

  function setCollectionOwnersCanSetRoyalties(bool _value) external onlyOwner {
    collectionOwnersCanSetRoyalties = _value;
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
  function RecoverMOVR(address to, uint256 amount) external onlyOwner {
    payable(to).transfer(amount);
  }



  // PRIVATE HELPERS
  function calculateAmounts(address ca, uint256 amount) private view returns (uint256, uint256, uint256, uint256, uint256){
    uint256 _collectionOwnerFee = collectionOwnerFees[ca] == 0 ? defaultCollectionOwnerFee : collectionOwnerFees[ca];
    uint256 devFeeAmount = amount * devFee / 1000;
    uint256 beanieHolderFeeAmount = amount * beanieHolderFee / 1000;
    uint256 beanBuybackFeeAmount = amount * beanBuybackFee / 1000;
    uint256 collectionOwnerFeeAmount = amount * _collectionOwnerFee / 1000;
    uint256 remainder = amount - (devFeeAmount + beanieHolderFeeAmount + beanBuybackFeeAmount + collectionOwnerFeeAmount);
    return (devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount, collectionOwnerFeeAmount, remainder);
  }

  function getNumberOfListings(address ca, uint256 tokenId) private view returns (uint256) {
    return listings[ca][tokenId].length;
  }

  function markListingAsAccepted(address ca, uint256 tokenId) private {
    Listing memory current = getCurrentListing(ca, tokenId);
    Listing memory replaced = current;
    replaced.accepted = true;

    uint256 index = getNumberOfListings(ca, tokenId);
    if (index != 0) {
      listings[ca][tokenId][index - 1] = replaced;
    }
  }

  function markOfferAsAccepted(address ca, uint256 tokenId, uint256 i, Offer storage offer) private {
    Offer memory replaced = offer;
    replaced.accepted = true;
    offers[ca][tokenId][i] = replaced;
  }

  function returnEscrowedFunds(address user, uint256 price) private {
    require(totalEscrowedAmount >= price, "Not enough funds to return escrow. Theoretically impossible.");
    require(totalInEscrow[user] >= price, "Not enough funds to return escrow. Theoretically impossible.");
    totalEscrowedAmount -= price;
    totalInEscrow[user] -= price;
    payable(user).transfer(price);
    emit EscrowReturned(user, price);
  }

  function escrowedPurchase(IERC721 _nft, address ca, uint256 tokenId, uint256 price, address payable oldOwner, address payable newOwner) private {
    require(totalInEscrow[newOwner] >= price, "Buyer does not have enough money in escrow.");
    require(totalEscrowedAmount >= price, "Escrow balance too low.");
    uint256 oldOwnerMovrBalance = oldOwner.balance;

    //calculate fees
    (uint256 devFeeAmount, uint256 beanieHolderFeeAmount, uint256 beanBuybackFeeAmount, uint256 collectionOwnerFeeAmount, uint256 remainder) = calculateAmounts(ca, price);
    totalInEscrow[newOwner] -= price;
    totalEscrowedAmount -= price;

    //swippity swappity
    _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
    oldOwner.transfer(remainder);

    //check that all went swimmingly
    require(oldOwner.balance >= (oldOwnerMovrBalance + remainder), "Funds were not successfully sent.");
    require(_nft.ownerOf(tokenId) == newOwner, "NFT was not successfully transferred.");
    emit TokenPurchased(oldOwner, newOwner, price, ca, tokenId);

    //fees
    if (feesOn) {
      if (useSuperGasTaxes) {
        sendFeeWithExtraGas(beanieHolderAddress, beanieHolderFeeAmount);
        sendFeeWithExtraGas(beanBuybackAddress, beanBuybackFeeAmount);
        sendFeeWithExtraGas(collectionOwners[ca], collectionOwnerFeeAmount);
        sendFeeWithExtraGas(devAddress, devFeeAmount);
      } else {
        payable(collectionOwners[ca]).transfer(collectionOwnerFeeAmount);
        payable(devAddress).transfer(devFeeAmount);
        payable(beanieHolderAddress).transfer(beanieHolderFeeAmount);
        payable(beanBuybackAddress).transfer(beanBuybackFeeAmount);
      }
    }
  }

  function tokenPurchase(IERC721 _nft, address ca, uint256 tokenId, uint256 price, address payable oldOwner, address payable newOwner) private {
    IERC20 _token = IERC20(TOKEN);
    require(_token.balanceOf(msg.sender) >= price, "Buyer does not have enough money to purchase.");
    require(_token.allowance(newOwner, address(this)) >= price, "Marketplace not approved to spend buyer tokens.");
    (uint256 devFeeAmount, uint256 beanieHolderFeeAmount, uint256 beanBuybackFeeAmount, uint256 collectionOwnerFeeAmount, uint256 remainder) = calculateAmounts(ca, price);

    _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
    _token.transferFrom(newOwner, oldOwner, remainder);

    require(_token.balanceOf(oldOwner) >= remainder, "Funds were not successfully sent.");
    require(_nft.ownerOf(tokenId) == newOwner, "NFT was not successfully transferred.");
    emit TokenPurchased(oldOwner, newOwner, price, ca, tokenId);

    //fees
    if (feesOn) {
      _token.transferFrom(address(this), collectionOwners[ca], collectionOwnerFeeAmount);
      _token.transferFrom(address(this), devAddress, devFeeAmount);
      _token.transferFrom(address(this), beanieHolderAddress, beanieHolderFeeAmount);
      _token.transferFrom(address(this), beanBuybackAddress, beanBuybackFeeAmount);
    }
  }

  function sendFeeWithExtraGas(address recipient, uint256 amount) internal {
    (bool success, ) = recipient.call{gas: specialTaxGas, value: amount}("");
    require(success, "Transfer failed.");
  }

  function _clearAllBids(address ca, uint256 tokenId) internal {
    Offer[] storage _offers = _getOffers(ca, tokenId);
    for (uint i = _offers.length-1; i >= 0; i--) {
      if (_offers[i].accepted == false && _offers[i].escrowed == true) {
        returnEscrowedFunds(_offers[i].buyer, _offers[i].price);
        emit BidCancelled(ca, tokenId, _offers[i].price, _offers[i].buyer, _offers[i].escrowed, block.timestamp);
      }
    }
    delete offers[ca][tokenId];
  }

}
