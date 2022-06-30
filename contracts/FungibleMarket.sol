//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.4;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract FungibleMarketPlace is ERC1155Receiver, ERC1155Holder, ReentrancyGuard, Ownable {

  event TradeOpened(bytes32 indexed tradeID, address indexed token, uint256 indexed id, uint256 nonce, uint256 quantity, uint256 price, address user, bool isSelling, uint256 deadline, uint256 timestamp);
  event TradeAccepted(bytes32 indexed tradeID, address indexed token, uint256 indexed id, uint256 nonce, uint256 quantity, uint256 price, address oldOwner, address newOwner, bool isSelling, uint256 deadline, uint256 timestamp);
  event TradeCancelled(bytes32 indexed tradeID, address indexed token, uint256 indexed id, uint256 nonce, uint256 quantity, uint256 price, address user, bool isSelling, uint256 deadline, uint256 timestamp);
  event EscrowReturned(address indexed user, uint256 indexed price);

  // Fees are out of 1000, to theoretically allow for 0.1 - 0.9% fees in the future.
  uint256 public devFee = 10; //1%
  uint256 public beanieHolderFee = 10; //1%
  uint256 public beanBuybackFee = 10; //1%
  uint256 public defaultCollectionOwnerFee = 0; //0%
  uint256 public totalEscrowedAmount = 0;
  uint256 public specialTaxGas = 100000;
  uint256 public nonce = 0;

  IERC20 public TOKEN = IERC20(0xAcc15dC74880C9944775448304B263D191c6077F); //WETH/WMOVR/WGLMR/WHATEVER
  address public devAddress = 0x24312a0b911fE2199fbea92efab55e2ECCeC637D;
  address public beanieHolderAddress = 0xdA6367C6510d8f2D20A345888f9Dff3eb3226B02;
  address public beanBuybackAddress = 0xE9b8258668E17AFA5D09de9F10381dE5565dbDc0;
  address public deadAddress = 0x000000000000000000000000000000000000dEaD;

  enum Status { OPEN_SALE, OPEN_BUY, ACCEPTED, CANCELLED }

  struct Trade {
    uint256 nonce;
    uint256 price;
    uint256 tokenId;
    uint256 quantity;
    uint256 timestamp;
    uint256 deadline;
    address ca;
    address initiator;
    address acceptor;
    bool escrowed;
    Status status;
  }

  bool public tradingPaused = false;
  bool public useSuperGasTaxes = true;
  bool public feesOn = true;
  bool public delistAfterAcceptingOffer = true;
  bool public clearBidsAfterAcceptingOffer = false;
  bool public clearBidsAfterFulfillingListing = false;
  bool public collectionOwnersCanSetRoyalties = true;
  bool public useDeadlines = false;
  mapping(address => bool) public collectionTradingEnabled;
  mapping(bytes32 => Trade) public trades;
  mapping(address => address) public collectionOwners;
  mapping(address => uint256) public totalInEscrow;
  mapping(address => uint256) public collectionOwnerFees;
  mapping(address => bool) public administrators;

  modifier onlyAdmins {
    require(administrators[_msgSender()] || owner() == _msgSender(), "Not owner or admin.");
    _;
  }

  // Required in order to receive MOVR/GLMR.
  receive() external payable { }

  // TRADES
  // Open a trade (from either the buyer or the seller's side).
  function openTrade(address ca, uint256 tokenId, uint256 quantity, uint256 price, uint256 deadline, bool isSelling, bool escrowed) public payable nonReentrant {
    
    // Basic checks.
    require(!tradingPaused, "Marketplace trading is disabled.");
    require(collectionTradingEnabled[ca], "Trading for this collection is not enabled.");
    require(deadline > block.timestamp, "Deadline must be later than now.");

    // Ownership, allowance, zero checks.
    if (isSelling) {
      require(IERC1155(ca).balanceOf(msg.sender, tokenId) >= quantity, "Not enough tokens owned for this trade.");
      require(IERC1155(ca).isApprovedForAll(msg.sender, address(this)), "Marketplace contract not approved for trading.");
    } else {
      if (escrowed) {
        require(msg.value >= price, "Insufficient funds/allowance to open this trade.");
      } else {
        require((TOKEN.allowance(msg.sender, address(this)) >= price) && (TOKEN.balanceOf(msg.sender) >= price), "Insufficient funds/allowance to open this trade.");
      }
    }
    require(price != 0 && quantity != 0, "No zero value trades.");

    // Create a unique trade ID.
    nonce +=1;
    bytes32 tradeID = keccak256(abi.encodePacked(msg.sender, block.timestamp, nonce));

    // Update user's escrow balance if necessary. Store and Emit new trade offer, 
    trades[tradeID] = Trade(nonce, price, tokenId, quantity, block.timestamp, deadline, ca, msg.sender, deadAddress, escrowed, (isSelling ? Status.OPEN_SALE : Status.OPEN_BUY));
    if (escrowed) {
      totalEscrowedAmount += price;
      totalInEscrow[msg.sender] += price;
    }
    emit TradeOpened(tradeID, ca, tokenId, nonce, quantity, price, msg.sender, isSelling, deadline, block.timestamp);
  }


  // Cancel a trade that the sender initiated.
  function cancelTrade(bytes32 tradeID) public nonReentrant {
    // Validate that trade can be cancelled.
    Trade memory _trade = trades[tradeID];
    require(_trade.status != Status.CANCELLED, "Trade already cancelled.");
    require(_trade.status != Status.ACCEPTED, "Trade already accepted.");
    require(_trade.initiator == msg.sender || administrators[msg.sender] || msg.sender == owner(), "You didn't open this trade.");
    if (_trade.escrowed) require(totalInEscrow[_trade.initiator] >= _trade.price && totalEscrowedAmount >= _trade.price, "Invalid refund.");

    //Update trade status and emit event.
    _trade.status = Status.CANCELLED;
    trades[tradeID] = _trade;
    emit TradeCancelled(tradeID, _trade.ca, _trade.tokenId, _trade.nonce, _trade.quantity, _trade.price, _trade.initiator, _trade.status == Status.OPEN_SALE, _trade.deadline, block.timestamp);

    //Return escrowed funds if necessary.
    if (_trade.escrowed) returnEscrowedFunds(_trade.initiator, _trade.price);
  }


  function acceptTrade(bytes32 tradeID) public payable nonReentrant {
    //Validate that trade can be accepted.
    Trade memory _trade = trades[tradeID];
    require(!tradingPaused, "Marketplace trading is disabled.");
    require(collectionTradingEnabled[_trade.ca], "Trading for this collection is not enabled.");
    require(_trade.status == Status.OPEN_SALE || _trade.status == Status.OPEN_BUY, "Trade unavailable.");
    if (useDeadlines) require(_trade.deadline > block.timestamp, "Deadline must be later than now.");

    //More checks, and figure out who gets what.
    address payable nftSeller;
    address nftBuyer;
    if (_trade.status == Status.OPEN_SALE) {
      if (_trade.escrowed) require(msg.value >= _trade.price, "Insufficient funds.");
      if (!_trade.escrowed) require((TOKEN.allowance(msg.sender, address(this)) >= _trade.price) && (TOKEN.balanceOf(msg.sender) >= _trade.price), "Insuffiicent funds.");
      require(IERC1155(_trade.ca).isApprovedForAll(_trade.initiator, address(this)), "Marketplace not approved.");

      nftSeller = payable(_trade.initiator);
      nftBuyer = msg.sender;
    } else if (_trade.status == Status.OPEN_BUY) {
      if (_trade.escrowed) require(totalInEscrow[_trade.initiator] >= _trade.price, "Insufficient funds.");
      if (!_trade.escrowed) require((TOKEN.allowance(_trade.initiator, address(this)) >= _trade.price) && (TOKEN.balanceOf(_trade.initiator) >= _trade.price), "Insufficient funds.");
      require(IERC1155(_trade.ca).isApprovedForAll(msg.sender, address(this)), "Marketplace not approved.");

      nftSeller = payable(msg.sender);
      nftBuyer = _trade.initiator;
    } else {
      revert("Trade in invalid state.");
    }

    //Calculate fees and amounts, update Trade state.
    (uint256 devFeeAmount, uint256 beanieHolderFeeAmount, uint256 beanBuybackFeeAmount, uint256 collectionOwnerFeeAmount, uint256 remainder) = calculateAmounts(_trade.ca, _trade.price);
    if (_trade.escrowed) {
      totalInEscrow[nftBuyer] -= _trade.price;
      totalEscrowedAmount -= _trade.price;
    }
    bool isSelling = _trade.status == Status.OPEN_SALE;
    _trade.status = Status.ACCEPTED;
    trades[tradeID] = _trade;

    acceptAndEmit(tradeID, _trade, nftSeller, nftBuyer, isSelling, remainder);

    //Send Fees
    if (feesOn) {
      if (_trade.escrowed) {
        if (useSuperGasTaxes) {
          sendFeeWithExtraGas(beanieHolderAddress, beanieHolderFeeAmount);
          sendFeeWithExtraGas(beanBuybackAddress, beanBuybackFeeAmount);
          sendFeeWithExtraGas(collectionOwners[_trade.ca], collectionOwnerFeeAmount);
          sendFeeWithExtraGas(devAddress, devFeeAmount);
        } else {
          payable(collectionOwners[_trade.ca]).transfer(collectionOwnerFeeAmount);
          payable(devAddress).transfer(devFeeAmount);
          payable(beanieHolderAddress).transfer(beanieHolderFeeAmount);
          payable(beanBuybackAddress).transfer(beanBuybackFeeAmount);
        }
      } else {
        TOKEN.transferFrom(nftBuyer, beanieHolderAddress, beanieHolderFeeAmount);
        TOKEN.transferFrom(nftBuyer, beanBuybackAddress, beanBuybackFeeAmount);
        TOKEN.transferFrom(nftBuyer, collectionOwners[_trade.ca], collectionOwnerFeeAmount);
        TOKEN.transferFrom(nftBuyer, devAddress, devFeeAmount);
      }
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

  function getTrade(bytes32 tradeID) external view returns (Trade memory) {
    return trades[tradeID];
  }



  // ADMIN FUNCTIONS
  function setAdmin(address admin, bool value) external onlyOwner {
    administrators[admin] = value;
  }

  function setPaymentToken(address _token) external onlyOwner {
    TOKEN = IERC20(_token);
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

  function setCollectionOwner(address ca, address _owner) external onlyAdmins {
    collectionOwners[ca] = _owner;
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

  function setCollectionOwnersCanSetRoyalties(bool _value) external onlyOwner {
    collectionOwnersCanSetRoyalties = _value;
  }

  // Emergency only - Recover Tokens
  function recoverToken(address _token, uint256 amount) external onlyOwner {
    IERC20(_token).transfer(owner(), amount);
  }

  // Emergency only - Recover 721s
  function recover721(address _token, uint256 tokenId) external onlyOwner {
    IERC721(_token).transferFrom(address(this), owner(), tokenId);
  }

  // Emergency only - Recover 1155s
  function recover1155(address _token, uint256 tokenId, uint256 amount) external onlyOwner {
    IERC1155(_token).safeTransferFrom(address(this), owner(), tokenId, amount, "");
  }

  // Emergency only - Recover ETH/MOVR/GLMR/WHATEVER
  function recoverGAS(address to, uint256 amount) external onlyOwner {
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

  function returnEscrowedFunds(address user, uint256 price) private {
    require(totalEscrowedAmount >= price, "Not enough funds to return escrow. Theoretically impossible.");
    require(totalInEscrow[user] >= price, "Not enough funds to return escrow. Theoretically impossible.");
    totalEscrowedAmount -= price;
    totalInEscrow[user] -= price;
    emit EscrowReturned(user, price);
    payable(user).transfer(price);
  }

  function sendFeeWithExtraGas(address recipient, uint256 amount) internal {
    (bool success, ) = recipient.call{gas: specialTaxGas, value: amount}("");
    require(success, "Transfer failed.");
  }

  function acceptAndEmit(bytes32 tradeID, Trade memory _trade, address payable nftSeller, address nftBuyer, bool isSelling, uint256 remainder) private {
    emit TradeAccepted(tradeID, _trade.ca, _trade.tokenId, _trade.nonce, _trade.quantity, _trade.price, nftSeller, nftBuyer, isSelling, _trade.deadline, block.timestamp);

    //Swippity Swappity
    IERC1155(_trade.ca).safeTransferFrom(nftSeller, nftBuyer, _trade.tokenId, _trade.quantity, "");
    if (_trade.escrowed) nftSeller.transfer(remainder);
    if (!_trade.escrowed) TOKEN.transferFrom(nftBuyer, nftSeller, remainder);
  }

}
