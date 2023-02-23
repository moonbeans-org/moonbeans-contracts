//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.9;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BeanUtils.sol";

import "./interface/IWETH.sol";
import "./interface/IBeanFeeProcessor.sol";

// General
error BEAN_NotOwnerOrAdmin();
error BEAN_TradingPaused();
error BEAN_CollectionNotEnabled();

// Trade Creation
error BEAN_NoEscrowedSell();
error BEAN_ZeroPrice();
error BEAN_BuyerAccountUnderfunded();
error BEAN_EscrowCurrencyUnderfunded();
error BEAN_SellAssetBalanceLow();
error BEAN_ContractNotApproved();
error BEAN_PaymentTokenNotApproved();

// Trade Fulfillment
error BEAN_OrderExpired();
error BEAN_OrderDoesNotExist();
error BEAN_NotAuthorized();
error BEAN_TradeNotParitalFill();
error BEAN_NotEnoughTokensToFulfullBuy();
error BEAN_NotEnoughInEscrow();
error BEAN_NotEnoughSellerAllowance();
error BEAN_NotEnoughMakerFunds();
error BEAN_AmountOverQuantity();
error BEAN_NotEnoughTokensToFulfull();
error BEAN_SellFulfillUnderfunded();
error BEAN_BuyOrderWithValue(); //TODO: Test
error BEAN_TransferFailed();

// Escrow
error BEAN_EscrowOverWithdraw();
error BEAN_WithdrawNotEnabled();

// Util
error BEAN_IntegerOverFlow();

contract FungibleBeanieMarketV1 is ReentrancyGuard, Ownable {
    using BeanUtils for bytes32[];

    event TradeOpened( bytes32 indexed tradeId, address indexed token, uint256 indexed tokenId, uint256 quantity, uint256 price, address maker, uint256 expiry, uint256 timestamp, TradeFlags tradeFlags);
    event TradeAccepted(bytes32 indexed tradeId, address indexed token, uint256 indexed tokenId, uint256 quantity, uint256 price, address oldOwner, address newOwner, TradeType tradeType, uint256 expiry, uint256 timestamp);
    event TradeCancelled( bytes32 indexed tradeId, address indexed token,  uint256 indexed tokenId, uint256 quantity, uint256 price, address maker, uint256 expiry, uint256 timestamp, TradeFlags tradeFlags);
    event EscrowReturned(address indexed user, uint256 indexed price);
    event CollectionModified(address indexed token, bool indexed enabled, address indexed owner, uint256 collectionOwnerFee, uint256 timestamp);

    uint256 constant MAX_INT = ~uint256(0);
    uint128 constant SMOL_MAX_INT = ~uint128(0);
    uint128 constant SMOLLER_MAX_INT = ~uint64(0);

    // Fees are out of 10000, to allow for 0.1% stepped fees.
    uint256 public defaultCollectionOwnerFee; //0%
    uint256 public totalEscrowedAmount;
    uint256 public nonce = 1;

    IWETH public TOKEN; //WETH
    IBeanFeeProcessor public BeanFeeProcessor;

    //
    enum TradeType { BUY, SELL }

    struct TradeFlags {
        TradeType tradeType;
        bool allowPartialFills;
        bool isEscrowed;
    }

    struct Trade {
        uint256 tokenId;
        uint256 quantity;
        uint128 price;
        uint64 expiry;
        uint64 posInUserRegister;
        address ca;
        address maker;
        TradeFlags tradeFlags;
    }

    // Admin flags
    bool public tradingPaused = false;
    bool public feesOn = true;
    bool public collectionOwnersCanSetRoyalties = true;
    bool public usersCanWithdrawEscrow = false; // admin controlled manual escape hatch. users can always withdraw by cancelling offers.

    // Collection / Order / Escrow / Admin data storage 
    mapping(address => bool) public collectionTradingEnabled;
    mapping(address => address) public collectionOwners;
    mapping(address => uint256) public collectionOwnerFees;
    mapping(address => uint256) public totalInEscrow;
    mapping(address => bool) public administrators;
    mapping(bytes32 => Trade) public trades;
    mapping(address => bytes32[]) sellOrdersByUser;
    mapping(address => bytes32[]) buyOrdersByUser;

    function getSellOrdersByUser(address user) external view returns(bytes32[] memory orderHashes) {
        orderHashes = sellOrdersByUser[user];
    }

    function getBuyOrdersByUser(address user) external view returns(bytes32[] memory orderHashes) {
        orderHashes = buyOrdersByUser[user];
    }

    constructor(address _token, address _beanFeeProcessor) {
        TOKEN = IWETH(_token);
        BeanFeeProcessor = IBeanFeeProcessor(_beanFeeProcessor);
        administrators[msg.sender] = true;
    }

    modifier onlyAdmins() {
        if (!(administrators[_msgSender()] || owner() == _msgSender()))
            revert BEAN_NotOwnerOrAdmin();
        _;
    }

    //---------------------------------
    //
    //            TRADES
    //
    //---------------------------------
    /**
     * @dev Opens a buy or sell order
     * @param ca Contract address of 1155 to list
     * @param tokenId `tokenId` of 1155 on `ca` to list
     * @param quantity quantity of `tokenId` to list
     * @param price price per token, where price for the entire listing equals `price` * `quantity`
     * @param expiry timestamp for order expiry
     * @param tradeFlags tradeflag struct to determine trade type (buy/sell), allow partial fills
     *        flag, and whether or not the trade is escrowed (requires submission of ETH, only for
     *        open buy orders)
     */
    function openTrade(address ca, uint256 tokenId, uint256 quantity, uint256 price, uint256 expiry, TradeFlags calldata tradeFlags) external payable nonReentrant {
        // Common checks
        if (tradingPaused) revert BEAN_TradingPaused();
        if (!collectionTradingEnabled[ca]) revert BEAN_CollectionNotEnabled();
        if (expiry < block.timestamp) revert BEAN_OrderExpired();
        if (price == 0) revert BEAN_ZeroPrice();
        if (price > SMOL_MAX_INT || expiry > SMOLLER_MAX_INT) revert BEAN_IntegerOverFlow();

        // Validate for buy or sell
        if (tradeFlags.tradeType == TradeType.BUY) {
            uint256 totalPrice = price * quantity;
            _validateBuyOrder(totalPrice, tradeFlags);
            if (tradeFlags.isEscrowed) {
                totalEscrowedAmount += totalPrice;
                totalInEscrow[msg.sender] += totalPrice;
            }
        } else {
            _validateSellOrder(ca, msg.sender, tokenId, quantity, tradeFlags);
        }

        bytes32 tradeId = _buildTradeId(msg.sender);
        uint256 posInRegister;

        if (tradeFlags.tradeType == TradeType.BUY) {
            posInRegister = buyOrdersByUser[msg.sender].length;
            buyOrdersByUser[msg.sender].push(tradeId);
        } else {
            posInRegister = sellOrdersByUser[msg.sender].length;
            sellOrdersByUser[msg.sender].push(tradeId);
        }

        trades[tradeId] = Trade(tokenId, quantity, uint128(price), uint64(expiry), uint64(posInRegister), ca, msg.sender, tradeFlags);
        emit TradeOpened(tradeId, ca, tokenId, quantity, price, msg.sender, expiry, block.timestamp, tradeFlags);
    }

    // Cancel a trade that the sender initiated. 
    function cancelTrade(bytes32 tradeId) external nonReentrant {
        // Validate that trade can be cancelled.
        Trade memory _trade = trades[tradeId];
        if (_trade.price == 0) revert BEAN_OrderDoesNotExist();

        // If this is an escrowed offer, we want to limit who can cancel it to the trade creator and admins, for unexpected-eth-pushing-is-bad security reasons.
        // If it's not escrowed (and won't cause eth to go flying around), then the public can cancel offers that have expired.
        bool privilegedDeletoooor = _trade.maker == msg.sender || administrators[msg.sender];
        bool expiredNonEscrowedTrade = !_trade.tradeFlags.isEscrowed && (_trade.expiry < block.timestamp);
        if (!privilegedDeletoooor && !expiredNonEscrowedTrade) revert BEAN_NotAuthorized(); 

        uint256 totalPrice = _trade.price * _trade.quantity;

        // Check if valid return of escrowed funds
        if ((_trade.tradeFlags.isEscrowed) && (totalInEscrow[_trade.maker] < totalPrice || totalEscrowedAmount < totalPrice) ) revert BEAN_EscrowOverWithdraw();

        // Cleanup data structures
        delete trades[tradeId];
        if (_trade.tradeFlags.tradeType == TradeType.BUY) {
            buyOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
        } else if (_trade.tradeFlags.tradeType == TradeType.SELL) {
            sellOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
        }

        //Return escrowed funds if necessary. `_trade.tradeFlags.isEscrowed` should never have a value if the order type is a sell.
        if (_trade.tradeFlags.isEscrowed) _returnEscrow(_trade.maker, totalPrice);

        emit TradeCancelled(tradeId, _trade.ca, _trade.tokenId, _trade.quantity, _trade.price, _trade.maker, _trade.expiry, block.timestamp, _trade.tradeFlags);
    }

    // Called to accept any open, valid, unexpired trade, whether it's a buy or a sell.
    function acceptTrade(bytes32 tradeId, uint256 amount) external payable nonReentrant {
        if (tradingPaused) revert BEAN_TradingPaused();

        Trade memory _trade = trades[tradeId];

        if (!collectionTradingEnabled[_trade.ca]) revert BEAN_CollectionNotEnabled();
        if (_trade.price == 0) revert BEAN_OrderDoesNotExist();
        if (_trade.expiry < block.timestamp) revert BEAN_OrderExpired();
        if (!_trade.tradeFlags.allowPartialFills && amount != _trade.quantity) revert BEAN_TradeNotParitalFill();
        if (amount > _trade.quantity) revert BEAN_AmountOverQuantity();

        uint256 totalPrice = _trade.price * amount;

        // Depending on whether this was initially a buy or sell order, set the seller and purchaser accordingly.
        (address seller, address purchaser) = (_trade.tradeFlags.tradeType == TradeType.SELL) ? (_trade.maker, msg.sender) : (msg.sender, _trade.maker);

        if (_trade.tradeFlags.tradeType == TradeType.SELL) {
            _fulfillSellOrder(tradeId, _trade, seller, purchaser, totalPrice, amount);
        } else if (_trade.tradeFlags.tradeType == TradeType.BUY) {
            _fulfillBuyOrder(tradeId, _trade, seller, purchaser, totalPrice, amount);
        } else {
            revert("Trade in invalid state.");
        }

        emit TradeAccepted(tradeId, _trade.ca, _trade.tokenId, _trade.quantity, _trade.price, seller, purchaser, _trade.tradeFlags.tradeType, _trade.expiry, block.timestamp);
    }

    function _validateSellOrder(address ca, address maker, uint256 tokenId, uint256 quantity, TradeFlags memory tradeFlags) internal view {
        if (IERC1155(ca).balanceOf(maker, tokenId) < quantity) revert BEAN_SellAssetBalanceLow(); // Non Fungible? Ser those are non-existent.
        if (!IERC1155(ca).isApprovedForAll(maker, address(this))) revert BEAN_ContractNotApproved(); // Need a lil' trust in this working relationship.
        if (tradeFlags.isEscrowed) revert BEAN_NoEscrowedSell(); // We don't tokens out of your wallet. Screw that.
    }

    function _validateBuyOrder(uint256 totalPrice, TradeFlags memory tradeFlags ) internal view {
        // Escrowed bid - didn't send enough ETH for requested quantity.
        if (tradeFlags.isEscrowed && msg.value < totalPrice) revert BEAN_EscrowCurrencyUnderfunded();
        // Non-escrowed bid - didn't set allowance for marketplace contract.
        if (!tradeFlags.isEscrowed && TOKEN.allowance(msg.sender, address(this)) < totalPrice) revert BEAN_PaymentTokenNotApproved();
        // Non-escrowed bid - ur a broke boi or non-boi.
        if (!tradeFlags.isEscrowed && TOKEN.balanceOf(msg.sender) < totalPrice) revert BEAN_BuyerAccountUnderfunded();
    }

    function _buildTradeId(address user) internal returns (bytes32 tradeId) {
      unchecked {++nonce;}
      tradeId = keccak256(
          abi.encodePacked(user, block.timestamp, nonce)
      );
    }

    function _processFees( address ca,  uint256 amount, address oldOwner) private {
        if (feesOn) {
            (uint256 totalAdminFeeAmount, uint256 collectionOwnerFeeAmount, uint256 remainder) = _calculateAmounts(ca, amount);
            _sendEth(oldOwner, remainder);
            if (collectionOwnerFeeAmount != 0) _sendEth(collectionOwners[ca], collectionOwnerFeeAmount);
            if (totalAdminFeeAmount != 0) _sendEth(address(BeanFeeProcessor), totalAdminFeeAmount);
        } else {
            _sendEth(oldOwner, amount);
        }
    }

    //---------------------------------
    //
    //      PUBLIC GETTERS + ESCROW
    //
    //---------------------------------
    function addMoneyToEscrow() external payable nonReentrant {
        if (!usersCanWithdrawEscrow) revert BEAN_WithdrawNotEnabled();
        totalEscrowedAmount += msg.value;
        totalInEscrow[msg.sender] += msg.value;
    }

    function withdrawMoneyFromEscrow(uint256 amount) external nonReentrant {
        if (!usersCanWithdrawEscrow) revert BEAN_WithdrawNotEnabled();
        if (totalInEscrow[msg.sender] < amount) revert BEAN_EscrowOverWithdraw();
        _returnEscrow(msg.sender, amount);
    }

    function getEscrowedAmount(address user) external view returns (uint256) {
        return totalInEscrow[user];
    }

    function getCollectionOwner(address ca) external view returns (address) {
        return collectionOwners[ca];
    }

    function computeOrderHash(address user, address token, uint256 tokenId, uint256 userNonce) public view returns (bytes32 offerHash) {
        return keccak256(abi.encode(user, token, tokenId, userNonce, block.timestamp));
    }

    function totalAdminFees() public view returns(uint256 totalFee) {
        totalFee = BeanFeeProcessor.totalFee();
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

    //---------------------------------
    //
    //        ADMIN FUNCTIONS
    //
    //---------------------------------
    function setAdmin(address admin, bool value) external onlyOwner {
        administrators[admin] = value;
    }

    function setTrading(bool value) external onlyOwner {
        require(tradingPaused != value, "Already set to that value.");
        tradingPaused = value;
    }

    function setCollectionTrading(address ca, bool value) external onlyAdmins {
        require(collectionTradingEnabled[ca] != value, "Already set to that value.");
        collectionTradingEnabled[ca] = value;
    }

    function setCollectionOwner(address ca, address _owner) external onlyAdmins {
        collectionOwners[ca] = _owner;
    }

    function setCollectionOwnerFee(address ca, uint256 fee) external {
        bool verifiedCollectionOwner = collectionOwnersCanSetRoyalties && (_msgSender() == collectionOwners[ca]);
        require(_msgSender() == owner() || verifiedCollectionOwner);
        require(fee <= 1000, "Max 10% fee");
        collectionOwnerFees[ca] = fee;
    }

    // Convenience function for listing / ~Partially~ implements EIP2981
    function listCollection(address ca, bool tradingEnabled, address _royaltyWallet, uint256 _fee) external onlyAdmins {
        uint256 fee = _fee;
        address royaltyWallet = _royaltyWallet;
        if (IERC165(ca).supportsInterface(0x2a55205a)) {
            (address receiver, uint256 royaltyAmount) = IERC2981(ca).royaltyInfo(1, 1 ether);
            royaltyWallet = receiver;
            fee = (10000 * royaltyAmount / 1 ether) >= 1000 ? 1000 : 10000 * royaltyAmount / 1 ether;
        }

        collectionTradingEnabled[ca] = tradingEnabled;
        collectionOwners[ca] = royaltyWallet;
        collectionOwnerFees[ca] = fee;
        emit CollectionModified(ca, tradingEnabled, _royaltyWallet, _fee, block.timestamp);
    }

    function setDefaultCollectionOwnerFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        defaultCollectionOwnerFee = fee;
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

    // Emergency only - Recover 1155s
    function recover1155(address _token, uint256 tokenId, uint256 amount) external onlyOwner {
        IERC1155(_token).safeTransferFrom(address(this), owner(), tokenId, amount, "");
    }

    // Emergency only - Recover ETH/MOVR/GLMR/WHATEVER
    function recoverGAS(address to, uint256 amount) external onlyOwner {
        _sendEth(to, amount);
    }

    //---------------------------------
    //
    //        PRIVATE HELPERS
    //
    //---------------------------------

    function _fulfillSellOrder(bytes32 tradeId, Trade memory _trade, address seller, address purchaser, uint256 totalPrice, uint256 amount) internal {
        // Check allowance and balance of token seller and verify that buyer sent enough ETH.
        if (!IERC1155(_trade.ca).isApprovedForAll(seller, address(this))) revert BEAN_ContractNotApproved();
        if (IERC1155(_trade.ca).balanceOf(seller, _trade.tokenId) < amount) revert BEAN_NotEnoughTokensToFulfull();
        if (msg.value < totalPrice) revert BEAN_SellFulfillUnderfunded();

        // We validate that amount < quantity in acceptTrade.
        uint256 remainingQuantity = _trade.quantity - amount;

        if (remainingQuantity == 0) {
            sellOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
            delete trades[tradeId];
        } else {
            trades[tradeId].quantity -= amount;
        }

        IERC1155(_trade.ca).safeTransferFrom(seller, purchaser, _trade.tokenId, amount, "");
        _processFees(_trade.ca, totalPrice, seller);
    }

    // Could use a future refactor to make escrow and non-escrow arms less interwoven.
    function _fulfillBuyOrder(bytes32 tradeId, Trade memory _trade, address seller, address purchaser, uint256 totalPrice, uint256 amount) internal {
        // Check allowance and balance of token seller and buy order fultiller (trade maker).
        if (msg.value > 0) revert BEAN_BuyOrderWithValue();
        if (!IERC1155(_trade.ca).isApprovedForAll(seller, address(this))) revert BEAN_ContractNotApproved();
        if (IERC1155(_trade.ca).balanceOf(seller, _trade.tokenId) < amount) revert BEAN_NotEnoughTokensToFulfull();

        if (_trade.tradeFlags.isEscrowed) {
            // Escrow only logic - validate that trade maker either has enough escrowed funds. 
            if (totalInEscrow[_trade.maker] < totalPrice) revert BEAN_NotEnoughInEscrow();
            totalEscrowedAmount -= totalPrice;
            totalInEscrow[purchaser] -= totalPrice;
        } else {
            // Non-Escrowed checks - validated that trademaker has enough WETH and the marketplace has a sufficient WETH allowance.
            if (TOKEN.balanceOf(_trade.maker) < totalPrice) revert BEAN_NotEnoughMakerFunds();
            if (TOKEN.allowance(_trade.maker, address(this)) < totalPrice) revert BEAN_NotEnoughSellerAllowance();
        }

        uint256 remainingQuantity = _trade.quantity - amount;

        if (remainingQuantity == 0) {
            buyOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
            delete trades[tradeId];
        } else {
            trades[tradeId].quantity -= amount;
        }

        IERC1155(_trade.ca).safeTransferFrom(seller, purchaser, _trade.tokenId, amount, "");
        
        if (_trade.tradeFlags.isEscrowed) {
            _processFees(_trade.ca, totalPrice, seller);
        } else {
            bool success = TOKEN.transferFrom(purchaser, address(this), totalPrice);
            if (!success) revert BEAN_TransferFailed();
            TOKEN.withdraw(totalPrice);
            _processFees(_trade.ca, totalPrice, seller);
        }
    }

    // I love you, you love me, we're a happy fee-mily
    function _calculateAmounts(address ca, uint256 amount) private view returns (uint256, uint256, uint256) {
        uint256 _collectionOwnerFee = collectionOwnerFees[ca] == 0
            ? defaultCollectionOwnerFee
            : collectionOwnerFees[ca];

        uint256 totalAdminFee = (amount * totalAdminFees()) / 10000;
        uint256 collectionOwnerFeeAmount = (amount * _collectionOwnerFee) / 10000;
        uint256 remainder = amount - (totalAdminFee + collectionOwnerFeeAmount);
        return (totalAdminFee, collectionOwnerFeeAmount, remainder);
    }

    function _returnEscrow(address user, uint256 amount) private {
        totalEscrowedAmount -= amount;
        totalInEscrow[user] -= amount;
        _sendEth(user, amount);
        emit EscrowReturned(user, amount);
    }

    function _sendEth(address _address, uint256 _amount) private {
        (bool success, ) = _address.call{value: _amount}("");
        require(success, "Transfer failed.");
    }

    // Required in order to receive MOVR/GLMR.
    receive() external payable {}
}
