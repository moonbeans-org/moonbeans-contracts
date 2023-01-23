//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.9;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BeanUtils.sol";

import "./interface/IWETH.sol";
import "./interface/IBeanFeeProcessor.sol";

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
error BEAN_PaymentTokenNotAproved();

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

// Util
error BEAN_IntegerOverFlow();

contract FungibleMarket is ReentrancyGuard, Ownable {
    using BeanUtils for bytes32[];

    event TradeOpened(
        bytes32 indexed tradeId,
        address indexed token,
        uint256 indexed tokenId,
        uint256 quantity,
        uint256 price,
        address maker,
        uint256 expiry,
        uint256 timestamp,
        TradeFlags tradeFlags
    );

    event TradeAccepted(
        bytes32 indexed tradeId,
        address indexed token,
        uint256 indexed tokenId,
        uint256 quantity,
        uint256 price,
        address oldOwner,
        address newOwner,
        TradeType tradeType,
        uint256 expiry,
        uint256 timestamp
    );

    event TradeCancelled(
        bytes32 indexed tradeId,
        address indexed token,
        uint256 indexed tokenId,
        uint256 quantity,
        uint256 price,
        address maker,
        uint256 expiry,
        uint256 timestamp,
        TradeFlags tradeFlags
    );
    event EscrowReturned(address indexed user, uint256 indexed price);

    uint256 constant MAX_INT = ~uint256(0);
    uint128 constant SMOL_MAX_INT = ~uint128(0);
    uint128 constant SMOLLER_MAX_INT = ~uint64(0);

    // Fees are out of 1000, to allow for 0.1% stepped fees.
    uint256 public defaultCollectionOwnerFee; //0%
    uint256 public totalEscrowedAmount;
    uint256 public nonce = 1;

    IWETH public TOKEN; //WETH, NOVA
    IBeanFeeProcessor public BeanFeeProcessor;

    enum TradeType {
        BUY,
        SELL
    }

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

    bool public tradingPaused = false;
    bool public feesOn = true;
    bool public collectionOwnersCanSetRoyalties = true;
    bool public useDeadlines = false;

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

    // TRADES
    /**
     * @dev Opens a buy or sell order
     * @param ca Contract address of 1155 to list
     * @param tokenId `tokenId` of 1155 on `ca` to list
     * @param quantity quantity of `tokenId` to list
     * @param price price per token, where price for the entire listing equals `price` * `quantity`
     * @param expiry timestamp for order expiry
     * @param tradeFlags tradeflag struct to determine trade type (buy/sell), allow partial fills
     *        flag, and whether or not the trade is escrowed (requres submission of ETH, only for
     *        open buy orders)
     */
    function openTrade(
        address ca,
        uint256 tokenId,
        uint256 quantity,
        uint256 price,
        uint256 expiry,
        TradeFlags calldata tradeFlags
    ) external payable nonReentrant {
        // Common checks
        if (tradingPaused) revert BEAN_TradingPaused();
        if (!collectionTradingEnabled[ca]) revert BEAN_CollectionNotEnabled();
        if (expiry < block.timestamp) revert BEAN_OrderExpired();
        if (price == 0) revert BEAN_ZeroPrice();
        if (price > SMOL_MAX_INT || expiry > SMOL_MAX_INT)
            revert BEAN_IntegerOverFlow();

        // Validate for buy or sell
        if (tradeFlags.tradeType == TradeType.BUY) {
            uint256 totalPrice = price * quantity;
            // TODO: The following `if (tradeFlags.isEscrowed)` loop could be nested inside of _validateBuyOrder.
            // It is kept external here to preserve _validateBuyOrder's role as validator only, but can be merged.
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

        trades[tradeId] = Trade(
            tokenId,
            quantity,
            uint128(price),
            uint64(expiry),
            uint64(posInRegister),
            ca,
            msg.sender,
            tradeFlags
        );
        emit TradeOpened(
            tradeId,
            ca,
            tokenId,
            quantity,
            price,
            msg.sender,
            expiry,
            block.timestamp,
            tradeFlags
        );
    }

    // Cancel a trade that the sender initiated.
    function cancelTrade(bytes32 tradeId) external nonReentrant {
        // Validate that trade can be cancelled.
        Trade memory _trade = trades[tradeId];
        if (_trade.price == 0) revert BEAN_OrderDoesNotExist();

        if (_trade.tradeFlags.isEscrowed) {
            if (
                _trade.maker != msg.sender &&
                !administrators[msg.sender]
            ) revert BEAN_NotAuthorized(); 
        }   else {
            if (
                _trade.maker != msg.sender &&
                !administrators[msg.sender] &&
                _trade.expiry > block.timestamp
            ) revert BEAN_NotAuthorized(); 
        }

        uint256 totalPrice = _trade.price * _trade.quantity;

        if (_trade.tradeFlags.isEscrowed)
            if (
                totalInEscrow[_trade.maker] < totalPrice ||
                totalEscrowedAmount < totalPrice
            ) revert BEAN_EscrowOverWithdraw();

        delete trades[tradeId];
        if (_trade.tradeFlags.tradeType == TradeType.BUY) {
            buyOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
        } else if (_trade.tradeFlags.tradeType == TradeType.SELL) {
            sellOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
        }

        //Return escrowed funds if necessary.
        if (_trade.tradeFlags.isEscrowed)
            //_trade.escrowed should never have a value if the order type is a sell.
            _returnEscrow(_trade.maker, totalPrice);

        emit TradeCancelled(
            tradeId,
            _trade.ca,
            _trade.tokenId,
            _trade.quantity,
            _trade.price,
            _trade.maker,
            _trade.expiry,
            block.timestamp,
            _trade.tradeFlags
        );
    }

    function _fulfillSellOrder(
        bytes32 tradeId,
        Trade memory _trade,
        address seller,
        address purchaser,
        uint256 totalPrice,
        uint256 amount
    ) internal {
        // Check allowances of buy order fulfiller.
        if (!IERC1155(_trade.ca).isApprovedForAll(seller, address(this)))
            revert BEAN_ContractNotApproved();
        if (IERC1155(_trade.ca).balanceOf(seller, _trade.tokenId) < amount)
            revert BEAN_NotEnoughTokensToFulfull();

        if (msg.value < totalPrice) revert BEAN_SellFulfillUnderfunded();

        uint256 remainingQuantity = _trade.quantity - amount;

        if (remainingQuantity == 0) {
            sellOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
            delete trades[tradeId];
        } else {
            trades[tradeId].quantity -= amount;
        }

        IERC1155(_trade.ca).safeTransferFrom(
            seller,
            purchaser,
            _trade.tokenId,
            amount,
            ""
        );
        _processFees(_trade.ca, totalPrice, seller);
    }

    //TODO: Consider a refactor to make escrow and non-escrow arms less interwoven.
    function _fulfillBuyOrder(
        bytes32 tradeId,
        Trade memory _trade,
        address seller,
        address purchaser,
        uint256 totalPrice,
        uint256 amount
    ) internal {
        // Check allowances of buy order fulfiller.
        if (msg.value > 0)
            revert BEAN_BuyOrderWithValue();
        if (!IERC1155(_trade.ca).isApprovedForAll(seller, address(this)))
            revert BEAN_ContractNotApproved();
        if (IERC1155(_trade.ca).balanceOf(seller, _trade.tokenId) < amount)
            revert BEAN_NotEnoughTokensToFulfull();
        if (TOKEN.balanceOf(_trade.maker) < totalPrice)
            revert BEAN_NotEnoughMakerFunds();

        if (_trade.tradeFlags.isEscrowed)
            if (totalInEscrow[_trade.maker] < totalPrice)
                revert BEAN_NotEnoughInEscrow();
            else if (TOKEN.allowance(_trade.maker, address(this)) < totalPrice)
                revert BEAN_NotEnoughSellerAllowance();

        if (_trade.tradeFlags.isEscrowed) {
            totalEscrowedAmount -= totalPrice;
            totalInEscrow[purchaser] -= totalPrice;
        }

        uint256 remainingQuantity = _trade.quantity - amount;

        if (remainingQuantity == 0) {
            buyOrdersByUser[_trade.maker].swapPop(_trade.posInUserRegister);
            delete trades[tradeId];
        } else {
            trades[tradeId].quantity -= amount;
        }

        IERC1155(_trade.ca).safeTransferFrom(
            seller,
            purchaser,
            _trade.tokenId,
            amount,
            ""
        );
        
        if (_trade.tradeFlags.isEscrowed) {
            _processFees(_trade.ca, totalPrice, seller);
        } else {
            bool success = TOKEN.transferFrom(purchaser, address(this), totalPrice);
            if (!success) revert BEAN_TransferFailed();
            TOKEN.withdraw(totalPrice);
            _processFees(_trade.ca, totalPrice, seller);
        }
    }

    function acceptTrade(bytes32 tradeId, uint256 amount)
        external
        payable
        nonReentrant
    {
        //Validate that trade can be accepted
        if (tradingPaused) revert BEAN_TradingPaused();

        Trade memory _trade = trades[tradeId];

        if (!collectionTradingEnabled[_trade.ca])
            revert BEAN_CollectionNotEnabled();
        if (_trade.price == 0) revert BEAN_OrderDoesNotExist();
        if (_trade.expiry < block.timestamp) revert BEAN_OrderExpired();
        if (!_trade.tradeFlags.allowPartialFills && amount != _trade.quantity)
            revert BEAN_TradeNotParitalFill();
        if (amount > _trade.quantity) revert BEAN_AmountOverQuantity();

        // Handle escrowed or non-escrowed buy order checks.
        uint256 totalPrice = _trade.price * amount;

        (address seller, address purchaser) = 
            (_trade.tradeFlags.tradeType == TradeType.SELL)
                ? (_trade.maker, msg.sender)
                : (msg.sender, _trade.maker);

        if (_trade.tradeFlags.tradeType == TradeType.SELL) {
            _fulfillSellOrder(
                tradeId,
                _trade,
                seller,
                purchaser,
                totalPrice,
                amount
            );
        } else if (_trade.tradeFlags.tradeType == TradeType.BUY) {
            _fulfillBuyOrder(
                tradeId,
                _trade,
                seller,
                purchaser,
                totalPrice,
                amount
            );
        } else {
            revert("Trade in invalid state.");
        }

        emit TradeAccepted(
            tradeId,
            _trade.ca,
            _trade.tokenId,
            _trade.quantity,
            _trade.price,
            seller,
            purchaser,
            _trade.tradeFlags.tradeType,
            _trade.expiry,
            block.timestamp
        );
    }

    function _validateSellOrder(
        address ca,
        address maker,
        uint256 tokenId,
        uint256 quantity,
        TradeFlags memory tradeFlags
    ) internal view {
        if (IERC1155(ca).balanceOf(maker, tokenId) < quantity)
            revert BEAN_SellAssetBalanceLow();
        if (!IERC1155(ca).isApprovedForAll(maker, address(this)))
            revert BEAN_ContractNotApproved();
        if (tradeFlags.isEscrowed)
            revert BEAN_NoEscrowedSell();
    }

    function _validateBuyOrder(
        uint256 totalPrice,
        TradeFlags memory tradeFlags
    ) internal view {
        // Validation
        if (tradeFlags.isEscrowed) {
            if (msg.value < totalPrice)
              revert BEAN_EscrowCurrencyUnderfunded();
        } else {
            //TODO: Split this error out to be explicit
            if (TOKEN.allowance(msg.sender, address(this)) < totalPrice)
                revert BEAN_PaymentTokenNotAproved();
            if (TOKEN.balanceOf(msg.sender) < totalPrice)
                revert BEAN_BuyerAccountUnderfunded();
        }
    }

    function _buildTradeId(
        address user
    ) internal returns (bytes32 tradeId) {
      unchecked {++nonce;}
      tradeId = keccak256(
          abi.encodePacked(user, block.timestamp, nonce)
      );
    }

    function _processFees(
        address ca,
        uint256 amount,
        address oldOwner
    ) private {
        if (feesOn) {
            //calculate fees
            (
                uint256 totalAdminFeeAmount,
                uint256 collectionOwnerFeeAmount,
                uint256 remainder
            ) = _calculateAmounts(ca, amount);
            _sendEth(oldOwner, remainder);
            _sendEth(collectionOwners[ca], collectionOwnerFeeAmount);
            _sendEth(address(BeanFeeProcessor), totalAdminFeeAmount);
        } else {
            _sendEth(oldOwner, amount);
        }
    }

    // PUBLIC ESCROW FUNCTIONS
    function addMoneyToEscrow() external payable nonReentrant {
        require(
            msg.value >= 10000000 gwei,
            "Minimum escrow deposit is 0.01 MOVR."
        );
        totalEscrowedAmount += msg.value;
        totalInEscrow[msg.sender] += msg.value;
    }

    function withdrawMoneyFromEscrow(uint256 amount) external nonReentrant {
        require(
            totalInEscrow[msg.sender] >= amount,
            "Trying to withdraw more than deposited."
        );
        _returnEscrow(msg.sender, amount);
    }

    function getEscrowedAmount(address user) external view returns (uint256) {
        return totalInEscrow[user];
    }

    // OTHER PUBLIC FUNCTIONS
    function getCollectionOwner(address ca) external view returns (address) {
        return collectionOwners[ca];
    }

    function computeOrderHash(
        address user,
        address token,
        uint256 tokenId,
        uint256 userNonce
    ) public view returns (bytes32 offerHash) {
        return
            keccak256(
                abi.encode(user, token, tokenId, userNonce, block.timestamp)
            );
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

    // ADMIN FUNCTIONS
    function setAdmin(address admin, bool value) external onlyOwner {
        administrators[admin] = value;
    }

    function setTrading(bool value) external onlyOwner {
        require(tradingPaused != value, "Already set to that value.");
        tradingPaused = value;
    }

    function setCollectionTrading(address ca, bool value) external onlyAdmins {
        require(
            collectionTradingEnabled[ca] != value,
            "Already set to that value."
        );
        collectionTradingEnabled[ca] = value;
    }

    function setCollectionOwner(address ca, address _owner)
        external
        onlyAdmins
    {
        collectionOwners[ca] = _owner;
    }

    function setCollectionOwnerFee(address ca, uint256 fee) external {
        bool verifiedCollectionOwner = collectionOwnersCanSetRoyalties &&
            (_msgSender() == collectionOwners[ca]);
        require(_msgSender() == owner() || verifiedCollectionOwner);
        require(fee <= 100, "Max 10% fee");
        collectionOwnerFees[ca] = fee;
    }

    function setDefaultCollectionOwnerFee(uint256 fee) external onlyOwner {
        require(fee <= 100, "Max 10% fee");
        defaultCollectionOwnerFee = fee;
    }

    function setFeesOn(bool _value) external onlyOwner {
        feesOn = _value;
    }

    function setCollectionOwnersCanSetRoyalties(bool _value)
        external
        onlyOwner
    {
        collectionOwnersCanSetRoyalties = _value;
    }

    // Emergency only - Recover Tokens
    function recoverToken(address _token, uint256 amount) external onlyOwner {
        IERC20(_token).transfer(owner(), amount);
    }

    // Emergency only - Recover 1155s
    function recover1155(
        address _token,
        uint256 tokenId,
        uint256 amount
    ) external onlyOwner {
        IERC1155(_token).safeTransferFrom(
            address(this),
            owner(),
            tokenId,
            amount,
            ""
        );
    }

    // Emergency only - Recover ETH/MOVR/GLMR/WHATEVER
    function recoverGAS(address to, uint256 amount) external onlyOwner {
        _sendEth(to, amount);
    }

    // PRIVATE HELPERS
    function _calculateAmounts(address ca, uint256 amount)
        private
        view
        returns (uint256, uint256, uint256)
    {
        uint256 _collectionOwnerFee = collectionOwnerFees[ca] == 0
            ? defaultCollectionOwnerFee
            : collectionOwnerFees[ca];

        uint256 totalAdminFee = (amount * totalAdminFees()) / 10000;
        uint256 collectionOwnerFeeAmount = (amount * _collectionOwnerFee) / 10000;
        uint256 remainder = amount - (totalAdminFee + collectionOwnerFeeAmount);
        return (
            totalAdminFee,
            collectionOwnerFeeAmount,
            remainder
        );
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
