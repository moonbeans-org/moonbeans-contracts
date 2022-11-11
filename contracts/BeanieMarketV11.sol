//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.4;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BeanUtils.sol";

import "hardhat/console.sol";

error BEANOwnerNotApproved();
error BEANNotAuthorized();
error BEANListingNotActive();
error BEANTradingPaused();
error BEANNotOwnerOrAdmin();
error BEANNoSelfOffer();
error BEANCollectionNotEnabled();

//General
error BEANZeroPrice();
error BEANBadPrice();

//Offers or Listings
error BEANContractNotApproved();
error BEANUserTokensLow();
error BEANOfferArrayPosMismatch();
error BEANNoCancellableOffer();
error BEANCallerNotOwner();
error BEANNotEnoughInEscrow();
error BEANOrderExpired();
error BEANBadExpiry();

//Escrow
error BEANWithdrawNotEnabled();
error BEANEscrowOverWithdraw();
error BEANZeroInEscrow();

contract BeanieMarketV11 is IERC721Receiver, ReentrancyGuard, Ownable {
    using BeanUtils for bytes32[];
    using BeanUtils for address[];

    event TokenListed(
        address indexed token,
        uint256 indexed id,
        uint256 indexed price,
        uint256 expiry,
        bytes32 listingHash,
        uint256 timestamp
    );
    event TokenDelisted(
        address indexed token,
        uint256 indexed id,
        bytes32 listingHash,
        uint256 timestamp
    );
    event TokenPurchased(
        address indexed oldOwner,
        address indexed newOwner,
        uint256 indexed price,
        address collection,
        uint256 tokenId,
        bytes32 tradeHash,
        uint256 timestamp
    );
    event OfferPlaced(
        address indexed token,
        uint256 indexed id,
        uint256 indexed price,
        uint256 expiry,
        address buyer,
        bytes32 offerHash,
        address potentialSeller
    );
    event OfferCancelled(
        address indexed token,
        uint256 indexed id,
        uint256 indexed price,
        uint256 expiry,
        address buyer,
        bytes32 offerHash,
        uint256 timestamp
    );
    event EscrowReturned(address indexed user, uint256 indexed price);

    // Constants
    uint256 private MAX_INT = 2**256 - 1;
    uint128 private SMOL_MAX_INT = 2**128 - 1;

    // Fees are out of 10000, to allow for 0.01 - 9.99% fees.
    uint256 public devFee = 100; //1%
    uint256 public beanieHolderFee = 100; //1%
    uint256 public beanBuybackFee = 100; //1%
    uint256 public defaultCollectionOwnerFee = 0; //0%
    uint256 public totalEscrowedAmount = 0;

    uint256 public accruedAdminFeesEth;
    uint256 public accruedAdminFees;

    address public TOKEN = 0x722E8BdD2ce80A4422E880164f2079488e115365; //WETH, NOVA
    address public devAddress = 0x24312a0b911fE2199fbea92efab55e2ECCeC637D;
    address public beanieHolderAddress = 0xB967DaE501F16E229A83f0C4FeA263A4be528dF4;
    address public beanBuybackAddress = 0xE9b8258668E17AFA5D09de9F10381dE5565dbDc0;

    mapping(bytes32 => ListingPos) public posInListings;
    mapping(bytes32 => OfferPos) public posInOffers;

    struct ListingPos {
        uint128 posInListingsByLister;
        uint128 posInListingsByContract;
    }

    struct OfferPos {
        uint256 posInOffersByOfferer;
    }

    struct Listing {
        uint256 tokenId;
        uint128 price;
        uint128 expiry;
        address contractAddress;
        address lister;
    }

    struct Offer {
        uint256 tokenId;
        uint128 price;
        uint128 expiry;
        address contractAddress;
        address offerer;
        bool escrowed;
    }

    mapping(bytes32 => Listing) public listings;
    mapping(address => bytes32[]) public listingsByLister;
    mapping(address => bytes32[]) public listingsByContract;
    mapping(address => mapping(uint256 => bytes32)) public currentListingOrderHash;

    mapping(bytes32 => Offer) public offers;
    mapping(address => bytes32[]) public offerHashesByBuyer;

    mapping(address => uint256) private userNonces;

    bool public tradingPaused = false;
    bool public feesOn = true;
    bool public autoSendFees = true;
    bool public collectionOwnersCanSetRoyalties = true;
    bool public usersCanWithdrawEscrow = false;

    mapping(address => bool) collectionTradingEnabled;
    mapping(address => address) collectionOwners;
    mapping(address => uint256) totalInEscrow;
    mapping(address => uint256) collectionOwnerFees;
    mapping(address => bool) administrators;

    modifier onlyAdmins() {
        if (!(administrators[_msgSender()] || owner() == _msgSender()))
            revert BEANNotOwnerOrAdmin();
        _;
    }

    constructor(address _TOKEN) {
        TOKEN = _TOKEN;
        approveSelf();
    }

    // Required in order to receive ERC 721's.
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // LISTINGS

    // Lists a token at the specified price point.
    function listToken(
        address ca,
        uint256 tokenId,
        uint256 price,
        uint256 expiry
    ) public {
        IERC721 token = IERC721(ca);
        if (msg.sender != token.ownerOf(tokenId))
            revert BEANCallerNotOwner();
        if (price == 0 || price > SMOL_MAX_INT)
            revert BEANBadPrice();
        if (!token.isApprovedForAll(msg.sender, address(this)))
            revert BEANContractNotApproved();
        if ((expiry != 0 && expiry < block.timestamp) || expiry > SMOL_MAX_INT)
            revert BEANBadExpiry();

        //Generate unique listing hash, increment nonce.
        bytes32 listingHash = computeOrderHash(msg.sender, ca, tokenId, userNonces[msg.sender]);
        unchecked {++userNonces[msg.sender]; }

        //Remove the old listing at contractAddress, tokenId. TODO: test

        bytes32 oldListingHash = currentListingOrderHash[ca][tokenId];
        if (oldListingHash != bytes32(0)) {
            Listing memory listing = listings[oldListingHash];
            updateListingPos(oldListingHash, listing.lister, listing.contractAddress);
            delete listings[oldListingHash];
        }

        //Store the new listing.
        listings[listingHash] = Listing(
            tokenId,
            uint128(price),
            uint128(expiry),
            ca,
            msg.sender
        );

        posInListings[listingHash] = ListingPos(
            uint128(listingsByLister[msg.sender].length),
            uint128(listingsByContract[ca].length)
        );
        listingsByLister[msg.sender].push(listingHash);
        listingsByContract[ca].push(listingHash);
        currentListingOrderHash[ca][tokenId] = listingHash;

        //Index me baby
        emit TokenListed(
            ca,
            tokenId,
            price,
            expiry,
            listingHash,
            block.timestamp
        );
    }

    // *Public* token delisting function, requiring either ownership OR invalidity to delist.
    function delistToken(bytes32 listingId) public {
        Listing memory listing = listings[listingId];
        IERC721 token = IERC721(listing.contractAddress);
        address tknOwner = token.ownerOf(listing.tokenId);

        if (!(msg.sender == owner() || administrators[msg.sender] || listing.expiry > block.timestamp)) revert BEANOwnerNotApproved();

        updateListingPos(listingId, tknOwner, listing.contractAddress);
        delete currentListingOrderHash[listing.contractAddress][listing.tokenId];
        delete listings[listingId];

        emit TokenDelisted(
            listing.contractAddress,
            listing.tokenId,
            listingId,
            block.timestamp
        );
    }

    // Allows a buyer to buy at the listed price.
    function fulfillListing(bytes32 listingId, address to) external payable nonReentrant {
        if (tradingPaused) revert BEANTradingPaused();
        Listing memory listing = listings[listingId];
        require(
            collectionTradingEnabled[listing.contractAddress],
            "Trading for this collection is not enabled."
        );
        require(listing.price != 0, "This token is not currently listed.");
        require(
            listing.price <= msg.value,
            "The amount sent is less than the asking price."
        );

        // verify that the listing is still valid
        address oldOwner = listing.lister;
        IERC721 token = IERC721(listing.contractAddress);

        if(oldOwner != token.ownerOf(listing.tokenId)) revert BEANListingNotActive();

        //effects - remove listing
        updateListingPos(listingId, oldOwner, listing.contractAddress);
        delete listings[listingId];

        //Interaction - transfer NFT and process fees
        token.safeTransferFrom(oldOwner, to, listing.tokenId);

        //fees
        //FIXME: Nested ifs kind of suck, see if I can linearize this
        if (feesOn) {
            (
                uint256 devFeeAmount,
                uint256 beanieHolderFeeAmount,
                uint256 beanBuybackFeeAmount,
                uint256 collectionOwnerFeeAmount,
                uint256 saleNetFees
            ) = calculateAmounts(listing.contractAddress, listing.price);
            _sendEth(oldOwner, saleNetFees);
            _sendEth( collectionOwners[listing.contractAddress], collectionOwnerFeeAmount);
            if (autoSendFees) {
                _processDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            } else {
                _accrueDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            }
        }
        else {
            _sendEth(oldOwner, listing.price);
        }
        emit TokenPurchased(
            oldOwner,
            msg.sender,
            listing.price,
            listing.contractAddress,
            listing.tokenId,
            listingId,
            block.timestamp
        );
    }

    function updateListingPos(bytes32 listingId, address tknOwner, address listingAddress) internal {
        ListingPos memory listingPos_ = posInListings[listingId];
        bytes32 offerHashToReplace;
        uint256 lastListerIndex = listingsByLister[tknOwner].length-1;

        offerHashToReplace = listingsByLister[tknOwner][lastListerIndex];
        listingsByLister[tknOwner].swapPop(listingPos_.posInListingsByLister);
        if (listingsByLister[tknOwner].length > 0) {
            posInListings[offerHashToReplace].posInListingsByLister = listingPos_.posInListingsByLister;
        }

        uint256 lastContractIndex = listingsByContract[listingAddress].length-1;

        offerHashToReplace = listingsByContract[listingAddress][lastContractIndex];
        listingsByContract[listingAddress].swapPop(listingPos_.posInListingsByContract);
        if (listingsByContract[listingAddress].length > 0) {
            posInListings[offerHashToReplace].posInListingsByContract = listingPos_.posInListingsByContract;
        }
        delete posInListings[listingId];
    }

    // OFFERS
    // Make a standard offer (checks balance of bidder, but does not escrow).
    // TODO: Robust tracking of extant offers and approval / fund coverage.
    function makeOffer(
        address ca,
        uint256 tokenId,
        uint256 price,
        uint256 expiry
    ) public payable {
        //FIXME: Can probably remove this. Trivial workaround having a second wallet.
        // require(msg.sender != IERC721(ca).ownerOf(tokenId), "Can not bid on your own NFT.");
        if (price == 0)
            revert BEANZeroPrice();
        if (IERC20(TOKEN).allowance(msg.sender, address(this)) < price)
            revert BEANContractNotApproved();
        if (IERC20(TOKEN).balanceOf(msg.sender) < price)
            revert BEANUserTokensLow();
        bytes32 offerHash = computeOrderHash(msg.sender, ca, tokenId, userNonces[msg.sender]);
        unchecked {++userNonces[msg.sender];}
        _storeOffer(offerHash, ca, msg.sender, tokenId, price, expiry, false);
        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash, IERC721(ca).ownerOf(tokenId));
    }

    // Make an escrowed offer (checks balance of bidder, then holds the bid in the contract as an escrow).
    function makeEscrowedOffer(
        address ca,
        uint256 tokenId,
        uint256 expiry
    ) public payable nonReentrant {
        uint256 price = msg.value;
        if (price == 0) revert BEANZeroPrice();

        totalEscrowedAmount += price;
        totalInEscrow[msg.sender] += price;

        bytes32 offerHash = computeOrderHash(msg.sender, ca, tokenId, userNonces[msg.sender]);
        unchecked {++userNonces[msg.sender];}
        _storeOffer(offerHash, ca, msg.sender, tokenId, price, expiry, true);

        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash, IERC721(ca).ownerOf(tokenId));
    }

    function computeOrderHash(
        address user,
        address token,
        uint256 tokenId,
        uint256 userNonce
    ) public view returns (bytes32 offerHash) {
        return keccak256(
            abi.encode(
                user,
                token,
                tokenId,
                userNonce,
                block.timestamp
            )
        );
    }

    function _storeOffer(
        bytes32 offerHash,
        address ca,
        address user,
        uint256 tokenId,
        uint256 price,
        uint256 expiry,
        bool escrowed
    ) private {
        //FIXME: futz around with this to see if we can shave off some gas later.
        offers[offerHash] = Offer(
            tokenId,
            uint128(price),
            uint128(expiry),
            ca,
            user,
            escrowed
        );
        posInOffers[offerHash] = OfferPos(offerHashesByBuyer[user].length);
        offerHashesByBuyer[user].push(offerHash);
    }

     // Cancel an offer (escrowed or not).
    function cancelOffer(
        bytes32 offerHash,
        bool returnEscrow
    ) external nonReentrant {
        Offer memory offer = offers[offerHash];
        // Check the checks
        if (offer.offerer != msg.sender && !administrators[msg.sender] && offer.expiry > block.timestamp ) revert BEANNotAuthorized();
        if (offer.price == 0) revert BEANNoCancellableOffer();

        // Remove the offer
        delete offers[offerHash];
        _updateOfferPos(offerHash, offer.offerer);

        // Handle returning escrowed funds
        if (offer.escrowed && returnEscrow) {
            if (offer.price > totalInEscrow[offer.offerer])
                revert BEANEscrowOverWithdraw();
            _returnEscrow(offer.offerer, offer.price);
        }
    }

    // Accept an active offer.
    function acceptOffer(
        bytes32 offerHash
    ) external nonReentrant {

        if (tradingPaused)
            revert BEANTradingPaused();

        Offer memory offer = offers[offerHash];
        IERC721 _nft = IERC721(offer.contractAddress);

        if (offer.expiry < block.timestamp)
            revert BEANOrderExpired();
        if(msg.sender != _nft.ownerOf(offer.tokenId))
            revert BEANCallerNotOwner();
        if (!collectionTradingEnabled[offer.contractAddress])
            revert BEANCollectionNotEnabled();

        delete offers[offerHash];
        _updateOfferPos(offerHash, offer.offerer);

        // Actually perform trade
        address payable oldOwner = payable(address(msg.sender));
        address payable newOwner = payable(address(offer.offerer));
        if (offer.escrowed) {
            escrowedPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        } else {
            tokenPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        }
        emit TokenPurchased(oldOwner, newOwner, offer.price, offer.contractAddress, offer.tokenId, offerHash, block.timestamp);
    }

    function _updateOfferPos(bytes32 offerId, address offerer) internal {
        OfferPos memory offerPos_ = posInOffers[offerId];
        //TODO: Try scoping this for gas cost
        bytes32 offerHashToReplace;
        //Cleanup accessory mappings. We pass the mapping results directly to the swapPop function to save memory height.
        uint256 lastOffererIndex = offerHashesByBuyer[offerer].length-1;

        offerHashToReplace = offerHashesByBuyer[offerer][lastOffererIndex];
        offerHashesByBuyer[offerer].swapPop(offerPos_.posInOffersByOfferer);
        if (offerHashesByBuyer[offerer].length > 0) {
            posInOffers[offerHashToReplace].posInOffersByOfferer = offerPos_.posInOffersByOfferer;
        }
        delete posInOffers[offerId];
    }

    // PUBLIC ESCROW FUNCTIONS
    function addFundsToEscrow() external payable nonReentrant {
        totalEscrowedAmount += msg.value;
        totalInEscrow[msg.sender] += msg.value;
    }

    function withdrawFundsFromEscrow(uint256 amount) external nonReentrant {
        if (!usersCanWithdrawEscrow)
            revert BEANWithdrawNotEnabled();
        if (totalInEscrow[msg.sender] == 0)
            revert BEANZeroInEscrow();
        if (totalInEscrow[msg.sender] < amount)
            revert BEANEscrowOverWithdraw();
        _returnEscrow(msg.sender, amount);
    }

    function getEscrowedAmount(address user) external view returns (uint256) {
        return totalInEscrow[user];
    }

    function _returnEscrow(address depositor, uint256 escrowAmount) private {
        totalEscrowedAmount -= escrowAmount;
        totalInEscrow[depositor] -= escrowAmount;
        _sendEth(depositor, escrowAmount);
    }

    //-------------------FEE PROCESSING-------------------
    /**
        @dev functions for accruing and processing ETH fees.
    */

    // Process accrued ETH fees.
    function processDevFeesEth() external nonReentrant onlyAdmins() {
        uint256 denominator = devFee + beanieHolderFee + beanBuybackFee;
        uint256 devFeeAmount = accruedAdminFeesEth * devFee / denominator;
        uint256 beanieFeeAmount = accruedAdminFeesEth * beanieHolderFee / denominator;
        uint256 beanBuybackAmount = ((accruedAdminFeesEth - devFeeAmount) - beanieFeeAmount);
        accruedAdminFeesEth = 0;
        _processDevFeesEth(devFeeAmount, beanieFeeAmount, beanBuybackAmount);
    }

    // Function for accruing ETH fees.
    function _accrueDevFeesEth(
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanBuybackAmount
    ) private {
        uint256 accruedFees = devAmount + beanieHolderAmount + beanBuybackAmount;
        accruedAdminFeesEth += accruedFees;
    }

    // Private function for processing ETH fees. Used in both dev process and auto process.
    function _processDevFeesEth(
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanBuybackAmount
    ) private {
        if (devAmount != 0 )
            _sendEth(devAddress, devAmount);
        if (beanieHolderAmount != 0 )
            _sendEth(beanieHolderAddress, beanieHolderAmount);
        if (beanBuybackAmount != 0 )
            _sendEth(beanBuybackAddress, beanBuybackAmount);
    }

    /**
        @dev functions for accruing and processing ETH fees.
    */

    // Process accrued token fees. Deposit 1 wei of payment token for gas savings prior to this.
    function processDevFeesToken() external nonReentrant onlyAdmins() {
        uint256 denominator = devFee + beanieHolderFee + beanBuybackFee;
        uint256 devFeeAmount = accruedAdminFees * devFee / denominator;
        uint256 beanieFeeAmount = accruedAdminFees * beanieHolderFee / denominator;
        uint256 beanBuybackAmount = ((accruedAdminFees - devFeeAmount) - beanieFeeAmount);
        accruedAdminFees = 0;
        _processDevFeesToken(address(this), devFeeAmount, beanieFeeAmount, beanBuybackAmount);
    }

    // Function for accruing token fees.
    function _accrueDevFeesToken(
        address from,
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanBuybackAmount
    ) private {
        uint256 accruedFees = devAmount + beanieHolderAmount + beanBuybackAmount;
        IERC20(TOKEN).transferFrom(from, address(this), accruedFees);
        accruedAdminFees += accruedFees;
    }

    // Private function for processing token fees. Used in both dev process and auto process.
    function _processDevFeesToken(
        address from,
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanBuybackAmount
    ) private {
        if (devAmount != 0 )
            IERC20(TOKEN).transferFrom(from, devAddress, devAmount);
        if (beanieHolderAmount != 0 )
            IERC20(TOKEN).transferFrom(from, beanieHolderAddress, beanieHolderAmount);
        if (beanBuybackAmount != 0 )
            IERC20(TOKEN).transferFrom(from, beanBuybackAddress, beanBuybackAmount);
    }

    // OTHER PUBLIC FUNCTIONS
    function getCollectionOwner(address ca) external view returns (address) {
        return collectionOwners[ca];
    }

    function totalFees() public view returns (uint256) {
        return (
            devFee +
            beanieHolderFee +
            beanBuybackFee +
            defaultCollectionOwnerFee
        );
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

    // Validates a listing's current status. Checks price is != 0, original lister is current lister,
    // token is approved, and that expiry has not passed (or is 0). Anyone can remove invalid listings.
    function isValidListing(bytes32 listingHash) public  view returns (bool isValid) {
        Listing memory listing = listings[listingHash];
        IERC721 token = IERC721(listing.contractAddress);
        address tknOwner = token.ownerOf(listing.tokenId);
        isValid = (listing.price != 0 &&
                    token.ownerOf(listing.tokenId) == listing.lister &&
                    token.isApprovedForAll(tknOwner, address(this)) &&
                    (listing.expiry == 0 || (listing.expiry > block.timestamp))
                    );
    }

    // Matches the old isListed function. Maintained for easy front-end backwards compatibility.
    // ONLY checks if a listing exists - NOT if it's a valid listing.
    function isListed(address ca, uint256 tokenId) public view returns (bool listingState) {
        bytes32 listingHash = currentListingOrderHash[ca][tokenId];
        Listing memory listing = listings[listingHash];
        listingState = (listing.price != 0 && (listing.expiry == 0 || (listing.expiry > block.timestamp)));
    }

    function getCurrentListing(address ca, uint256 tokenId) public view returns (Listing memory listing) {
        bytes32 listingHash = currentListingOrderHash[ca][tokenId];
        listing = listings[listingHash];
    }

    // ADMIN FUNCTIONS
    function setAdmin(address admin, bool value) external onlyOwner {
        administrators[admin] = value;
    }

    function setPaymentToken(address _token) external onlyOwner {
        TOKEN = _token;
    }

    function clearListing(bytes32 listingId) external onlyAdmins {
        delete listings[listingId];
    }

    function setTrading(bool value) external onlyOwner {
        tradingPaused = value;
    }

    // Convenience function for listing / Partially implements EIP2981
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
    }

    function setCollectionTrading(address ca, bool value) external onlyAdmins {
        collectionTradingEnabled[ca] = value;
    }

    function setCollectionOwner(address ca, address _owner) external onlyAdmins {
        collectionOwners[ca] = _owner;
    }

    function setDevFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        devFee = fee;
    }

    function setBeanieHolderFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        beanieHolderFee = fee;
    }

    function setBeanBuyBackFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        beanBuybackFee = fee;
    }

    function setCollectionOwnerFee(address ca, uint256 fee) external {
        // Collection owner or contract owner can set fees
        bool verifiedCollectionOwner = collectionOwnersCanSetRoyalties && (_msgSender() == collectionOwners[ca]);
        require((_msgSender() == owner()) || verifiedCollectionOwner);
        require(fee <= 1000, "Max 10% fee");
        collectionOwnerFees[ca] = fee;
    }

    function setDefaultCollectionOwnerFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
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

    function setFeesOn(bool _value) external onlyOwner {
        feesOn = _value;
    }

    function setAutoSendFees(bool _value) external onlyOwner {
        autoSendFees = _value;
    }

    function setUsersCanWithdrawEscrow(bool _value) external onlyAdmins {
        usersCanWithdrawEscrow = _value;
    }

    function setCollectionOwnersCanSetRoyalties(bool _value) external  onlyOwner {
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

    function getListingsByLister(address lister) public view returns(bytes32[] memory) {
        return listingsByLister[lister];
    }

    function getListingsByContract(address contractAddress) public view returns(bytes32[] memory) {
        return listingsByContract[contractAddress];
    }

    function getOffersByOfferer(address offerer) public view returns(bytes32[] memory) {
        return offerHashesByBuyer[offerer];
    }

    // PRIVATE HELPERS
    function calculateAmounts(address ca, uint256 amount)
        private
        view
        returns (uint256, uint256, uint256, uint256, uint256)
    {
        uint256 _collectionOwnerFee = collectionOwnerFees[ca] == 0
            ? defaultCollectionOwnerFee
            : collectionOwnerFees[ca];
        uint256 devFeeAmount = (amount * devFee) / 10000;
        uint256 beanieHolderFeeAmount = (amount * beanieHolderFee) / 10000;
        uint256 beanBuybackFeeAmount = (amount * beanBuybackFee) / 10000;
        uint256 collectionOwnerFeeAmount = (amount * _collectionOwnerFee) /
            10000;
        uint256 remainder = amount -
            (devFeeAmount +
                beanieHolderFeeAmount +
                beanBuybackFeeAmount +
                collectionOwnerFeeAmount);
        return (
            devFeeAmount,
            beanieHolderFeeAmount,
            beanBuybackFeeAmount,
            collectionOwnerFeeAmount,
            remainder
        );
    }

    function escrowedPurchase(
        IERC721 _nft,
        address ca,
        uint256 tokenId,
        uint256 price,
        address payable oldOwner,
        address payable newOwner
    ) private {
        require(
            totalInEscrow[newOwner] >= price,
            "Buyer does not have enough money in escrow."
        );
        require(totalEscrowedAmount >= price, "Escrow balance too low.");

        //update escrow amounts
        totalInEscrow[newOwner] -= price;
        totalEscrowedAmount -= price;
        //swippity swappity
        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        //fees
        if (feesOn) {
            //calculate fees
            (
                uint256 devFeeAmount,
                uint256 beanieHolderFeeAmount,
                uint256 beanBuybackFeeAmount,
                uint256 collectionOwnerFeeAmount,
                uint256 remainder
            ) = calculateAmounts(ca, price);
            _sendEth(oldOwner, remainder);
            _sendEth(collectionOwners[ca], collectionOwnerFeeAmount);
            if (autoSendFees) {
                _processDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            } else {
                _accrueDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            }
        } else {
            _sendEth(oldOwner, price);
        }
    }

    function tokenPurchase(
        IERC721 _nft,
        address ca,
        uint256 tokenId,
        uint256 price,
        address payable oldOwner,
        address payable newOwner
    ) private {
        IERC20 _token = IERC20(TOKEN);
        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        //fees
        if (feesOn) {
            (
                uint256 devFeeAmount,
                uint256 beanieHolderFeeAmount,
                uint256 beanBuybackFeeAmount,
                uint256 collectionOwnerFeeAmount,
                uint256 priceNetFees
            ) = calculateAmounts(ca, price);
            _token.transferFrom(newOwner, oldOwner, priceNetFees);
            _token.transferFrom(newOwner, collectionOwners[ca], collectionOwnerFeeAmount);
            if (autoSendFees) {
                _processDevFeesToken(newOwner, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            } else {
                _accrueDevFeesToken(newOwner, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            }
        } else {
            _token.transferFrom(newOwner, oldOwner, price);
        }
    }

    function _sendEth(address _address, uint256 _amount) private {
        (bool success, ) = _address.call{value: _amount}("");
        require(success, "Transfer failed.");
    }

    function approveSelf() public onlyAdmins() {
        IERC20(TOKEN).approve(address(this), type(uint256).max);
    }
}
