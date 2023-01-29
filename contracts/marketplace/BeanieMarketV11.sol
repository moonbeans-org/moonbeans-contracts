//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.9;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interface/IWETH.sol";
import "./interface/IBeanFeeProcessor.sol";

import "./BeanUtils.sol";

//General
error BEAN_DelistNotApproved();
error BEAN_NotAuthorized();
error BEAN_ListingNotActive();
error BEAN_TradingPaused();
error BEAN_NotOwnerOrAdmin();
error BEAN_NoSelfOffer();
error BEAN_CollectionNotEnabled();
error BEAN_IntegerOverFlow();

//Offers or Listings
error BEAN_ZeroPrice();
error BEAN_BadPrice();
error BEAN_ContractNotApproved();
error BEAN_UserTokensLow();
error BEAN_OfferArrayPosMismatch();
error BEAN_NoCancellableOffer();
error BEAN_CallerNotOwner();
error BEAN_NotEnoughInEscrow();
error BEAN_OrderExpired();
error BEAN_BadExpiry();
error BEAN_NoOfferFound();
error BEAN_TokenNotListed();
error BEAN_NotEnoughEthSent();

//Escrow
error BEAN_TransferFailed();
error BEAN_WithdrawNotEnabled();
error BEAN_EscrowOverWithdraw();
error BEAN_ZeroInEscrow();

contract BeanieMarketV11 is ReentrancyGuard, Ownable {
    using BeanUtils for bytes32[];
    using BeanUtils for address[];

    event TokenListed(address indexed token, uint256 indexed id, uint256 indexed price, uint256 expiry, bytes32 listingHash, uint256 timestamp);
    event TokenDelisted(address indexed token, uint256 indexed id, bytes32 listingHash, uint256 timestamp);
    event TokenPurchased(address indexed oldOwner, address indexed newOwner, uint256 indexed price, address collection, uint256 tokenId, bytes32 tradeHash, uint256 timestamp);
    event OfferPlaced(address indexed token, uint256 indexed id, uint256 indexed price, uint256 expiry, address buyer, bytes32 offerHash, address potentialSeller);
    event OfferCancelled(address indexed token, uint256 indexed id, uint256 indexed price, uint256 expiry, address buyer, bytes32 offerHash, uint256 timestamp);
    event EscrowReturned(address indexed user, uint256 indexed price);
    event CollectionModified(address indexed token, bool indexed enabled, address indexed owner, uint256 collectionOwnerFee, uint256 timestamp);

    uint256 public constant MAX_INT = ~uint256(0);
    uint128 public constant SMOL_MAX_INT = ~uint128(0);

    // Fees are out of 10000, to allow for 0.01 - 9.99% fees.
    uint256 public defaultCollectionOwnerFee; //0%
    uint256 public totalEscrowedAmount;

    IWETH public TOKEN; //WETH, NOVA
    IBeanFeeProcessor public BeanFeeProcessor;

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

    // Listing-related storage
    mapping(bytes32 => Listing) public listings;
    mapping(address => bytes32[]) public listingsByLister;
    mapping(address => bytes32[]) public listingsByContract;
    mapping(address => mapping(uint256 => bytes32)) public currentListingOrderHash;

    // Offer-relatead storage
    mapping(bytes32 => Offer) public offers;
    mapping(address => bytes32[]) public offerHashesByBuyer;

    // Address-based nonce-counting
    mapping(address => uint256) private userNonces;

    // Admin flags
    bool public tradingPaused = false;
    bool public feesOn = true;
    bool public collectionOwnersCanSetRoyalties = true;
    bool public usersCanWithdrawEscrow = false; // admin controlled manual escape hatch. users can always withdraw by cancelling offers.

    // Collection-related storage ++ misc
    mapping(address => bool) collectionTradingEnabled;
    mapping(address => address) collectionOwners;
    mapping(address => uint256) collectionOwnerFees;
    mapping(address => uint256) totalInEscrow;
    mapping(address => bool) administrators;

    modifier onlyAdmins() {
        if (!(administrators[_msgSender()] || owner() == _msgSender()))
            revert BEAN_NotOwnerOrAdmin();
        _;
    }

    constructor(address _TOKEN, address _BEANFEEPROCESSOR) {
        TOKEN = IWETH(_TOKEN);
        BeanFeeProcessor = IBeanFeeProcessor(_BEANFEEPROCESSOR);
        administrators[msg.sender] = true;
    }

    //---------------------------------
    //
    //            LISTINGS
    //
    //---------------------------------

    // Lists a token at the specified price point.
    function listToken(address ca, uint256 tokenId, uint256 price, uint256 expiry) public {
        IERC721 token = IERC721(ca);

        // Check listing prerequisites. 
        // We require uints <= SMOL_MAX_INT to prevent potential casting issues later.
        if (price > SMOL_MAX_INT || expiry > SMOL_MAX_INT) revert BEAN_IntegerOverFlow();
        if (msg.sender != token.ownerOf(tokenId)) revert BEAN_CallerNotOwner();
        if (!token.isApprovedForAll(msg.sender, address(this))) revert BEAN_ContractNotApproved();
        if (expiry != 0 && expiry < block.timestamp) revert BEAN_BadExpiry();

        // Generate unique listing hash, increment nonce.
        bytes32 listingHash = computeOrderHash(msg.sender, ca, tokenId, userNonces[msg.sender]);
        unchecked {++userNonces[msg.sender];}

        // If this token was already listed, handle updating previous listing hash.
        bytes32 oldListingHash = currentListingOrderHash[ca][tokenId];
        if (oldListingHash != bytes32(0)) {
            Listing memory listing = listings[oldListingHash];
            _cleanupListing(oldListingHash, listing.lister, listing.contractAddress, listing.tokenId);
        }

        // Store the new listing.
        listings[listingHash] = Listing(tokenId, uint128(price), uint128(expiry), ca, msg.sender);

        // Stick this new listing at the end of both tracking arrays
        posInListings[listingHash] = ListingPos(
            uint128(listingsByLister[msg.sender].length),
            uint128(listingsByContract[ca].length)
        );
        listingsByLister[msg.sender].push(listingHash);
        listingsByContract[ca].push(listingHash);

        // Keeps track of current listing for this specific token.
        currentListingOrderHash[ca][tokenId] = listingHash;

        // Index me baby
        emit TokenListed(ca, tokenId, price, expiry, listingHash, block.timestamp);
    }

    // *Public* token delisting function, requiring either ownership OR invalidity to delist.
    function delistToken(bytes32 listingId) public {
        Listing memory listing = listings[listingId];
        IERC721 token = IERC721(listing.contractAddress);
        address tknOwner = token.ownerOf(listing.tokenId);

        // If listing is invalid due to expiry, transfer, or approval revoke, (or caller has admin perms), anyone can delist. 
        if (
            msg.sender != tknOwner &&                          // If not owner
            !administrators[msg.sender] &&                     // and not admin
            listing.lister == tknOwner &&                      // and current owner matches og lister
            token.isApprovedForAll(tknOwner, address(this)) && // and token is approved for trade
            listing.expiry > block.timestamp                   // and listing is not expired
        )
            revert BEAN_DelistNotApproved();                    // you can't delist, ser

        // Clean up old listing from all lister array, collection array, all listings, and current listings.
        _cleanupListing(listingId, tknOwner, listing.contractAddress, listing.tokenId);

        // Index moi
        emit TokenDelisted(listing.contractAddress, listing.tokenId, listingId, block.timestamp);
    }

    // Allows a buyer to buy at the listed price - sending the purchased token to `to`.
    function fulfillListing(bytes32 listingId, address to) external payable nonReentrant {
        if (tradingPaused) 
            revert BEAN_TradingPaused();
        
        Listing memory listing = listings[listingId];
        
        if (!collectionTradingEnabled[listing.contractAddress]) revert BEAN_CollectionNotEnabled();
        if (listing.price == 0) revert BEAN_TokenNotListed();
        if (msg.value < listing.price) revert BEAN_NotEnoughEthSent();
        if (listing.expiry != 0 && block.timestamp > listing.expiry) revert BEAN_OrderExpired();

        // Verify that the listing is still valid (current owner is original lister)
        address originalLister = listing.lister;
        IERC721 token = IERC721(listing.contractAddress);

        if(originalLister != token.ownerOf(listing.tokenId)) 
            revert BEAN_ListingNotActive();

        // Effects - cleanup listing data structures
        _cleanupListing(listingId, originalLister, listing.contractAddress, listing.tokenId);

        // Interaction - transfer NFT and process fees. Will fail if token no longer approved
        token.safeTransferFrom(originalLister, to, listing.tokenId);

        //Fees
        _processFees(
            listing.contractAddress,
            listing.price,
            originalLister
        );

        // Ty for your business
        emit TokenPurchased(originalLister, msg.sender, listing.price, listing.contractAddress, listing.tokenId, listingId, block.timestamp);
    }

    //---------------------------------
    //
    //            OFFERS
    //
    //---------------------------------

    // Non-escrowed offer (WETH only)
    function makeOffer(address ca, uint256 tokenId, uint256 price, uint256 expiry) public {
        // Same as listings - do all the checks. Make sure uints are < uint128 for casting reasons.
        if (price > SMOL_MAX_INT || expiry > SMOL_MAX_INT) revert BEAN_IntegerOverFlow();
        if (tradingPaused) revert BEAN_TradingPaused();
        if (price == 0) revert BEAN_ZeroPrice();
        if (TOKEN.allowance(msg.sender, address(this)) < price) revert BEAN_ContractNotApproved();
        if (TOKEN.balanceOf(msg.sender) < price) revert BEAN_UserTokensLow();
        if (expiry != 0 && expiry < block.timestamp) revert BEAN_BadExpiry();

        // Calculate and store new offer.
        bytes32 offerHash = computeOrderHash(msg.sender, ca, tokenId, userNonces[msg.sender]);
        unchecked {++userNonces[msg.sender];}
        _storeOffer(offerHash, ca, msg.sender, tokenId, price, expiry, false);

        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash, IERC721(ca).ownerOf(tokenId));
    }

    // ETH offer, escrowed.
    function makeEscrowedOfferEth(address ca, uint256 tokenId, uint256 expiry) public payable nonReentrant {
        _processEscrowOffer(ca, tokenId, expiry, msg.value);
    }

    // WETH offer, escrowed.
    function makeEscrowedOfferTokens(address ca, uint256 tokenId, uint256 expiry, uint256 price) public payable nonReentrant {
        bool success = TOKEN.transferFrom(msg.sender, address(this), price);
        if (!success) revert BEAN_TransferFailed();
        TOKEN.withdraw(price);
        _processEscrowOffer(ca, tokenId, expiry, price);
    }

    // Cancel an offer (escrowed or not). Callable only by offer maker or token owner.
    function cancelOffer(bytes32 offerHash) external nonReentrant {
        Offer memory offer = offers[offerHash];
        if (offer.offerer != msg.sender && IERC721(offer.contractAddress).ownerOf(offer.tokenId) != msg.sender) revert BEAN_NotAuthorized();
        if (offer.price == 0) revert BEAN_NoCancellableOffer();

        // Remove the offer from data storage.
        _cleanupOffer(offerHash, offer.offerer);

        // Handle returning escrowed funds
        if (offer.escrowed) {
            if (offer.price > totalInEscrow[offer.offerer]) revert BEAN_EscrowOverWithdraw();
            _returnEscrow(offer.offerer, offer.price);
        }
    }

    // Same as above, admin only, no ownership check.
    function cancelOfferAdmin(bytes32 offerHash, bool returnEscrow) external onlyAdmins nonReentrant {
        Offer memory offer = offers[offerHash];
        if (offer.price == 0)  revert BEAN_NoCancellableOffer();

        _cleanupOffer(offerHash, offer.offerer);

        if (offer.escrowed && returnEscrow) {
            if (offer.price > totalInEscrow[offer.offerer]) revert BEAN_EscrowOverWithdraw();
            _returnEscrow(offer.offerer, offer.price);
        }
    }

    // Accept an active offer.
    function acceptOffer( bytes32 offerHash) external nonReentrant {
        if (tradingPaused) revert BEAN_TradingPaused();

        Offer memory offer = offers[offerHash];
        IERC721 _nft = IERC721(offer.contractAddress);

        if (!collectionTradingEnabled[offer.contractAddress]) revert BEAN_CollectionNotEnabled();
        if (offer.price == 0) revert BEAN_NoOfferFound();
        if (offer.expiry != 0 && block.timestamp > offer.expiry) revert BEAN_OrderExpired();
        if(msg.sender != _nft.ownerOf(offer.tokenId)) revert BEAN_CallerNotOwner();

        _cleanupOffer(offerHash, offer.offerer);

        // Actually perform trade
        address payable oldOwner = payable(address(msg.sender));
        address payable newOwner = payable(address(offer.offerer));
        if (offer.escrowed) {
            _escrowedPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        } else {
            _tokenPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        }
        emit TokenPurchased(oldOwner, newOwner, offer.price, offer.contractAddress, offer.tokenId, offerHash, block.timestamp);
    }

    // Just a little hash helper. Used by both listings and orders.
    function computeOrderHash(address user,  address token, uint256 tokenId, uint256 userNonce) public view returns (bytes32 offerHash) {
        return keccak256(abi.encode(user, token, tokenId, userNonce, block.timestamp));
    }


    //---------------------------------
    //
    //            ESCROW
    //
    //---------------------------------

    // Manual functions to only be enabled in case of contract migration, as they will throw off escrowed amount values.
    // Escrowed funds can always be withdrawn by cancelling placed bids.
    function addFundsToEscrow() external payable nonReentrant {
        if (!usersCanWithdrawEscrow) revert BEAN_WithdrawNotEnabled();
        totalEscrowedAmount += msg.value;
        totalInEscrow[msg.sender] += msg.value;
    }

    function withdrawFundsFromEscrow(uint256 amount) external nonReentrant {
        if (!usersCanWithdrawEscrow) revert BEAN_WithdrawNotEnabled();
        if (totalInEscrow[msg.sender] == 0) revert BEAN_ZeroInEscrow();
        if (totalInEscrow[msg.sender] < amount) revert BEAN_EscrowOverWithdraw();
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

    //---------------------------------
    //
    //         FEE PROCESSING
    //
    //---------------------------------
    
    /**
    *   @dev functions for accruing and processing ETH fees.
    */

    function _processFees(address ca, uint256 amount, address oldOwner) private {
        if (feesOn) {
            (uint256 totalAdminFeeAmount, uint256 collectionOwnerFeeAmount, uint256 remainder) = _calculateAmounts(ca, amount);
            _sendEth(oldOwner, remainder);
            _sendEth(collectionOwners[ca], collectionOwnerFeeAmount);
            _sendEth(address(BeanFeeProcessor), totalAdminFeeAmount);
        } else {
            _sendEth(oldOwner, amount);
        }
    }

    //---------------------------------
    //
    //     VARIOUS PUBLIC GETTERS
    //
    //---------------------------------
    function getCollectionOwner(address ca) external view returns (address) {
        return collectionOwners[ca];
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
    function isValidListing(bytes32 listingHash) public view returns (bool isValid) {
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

    //---------------------------------
    //
    //     ADMIN FUNCTIONS
    //
    //---------------------------------
    function setAdmin(address admin, bool value) external onlyOwner {
        administrators[admin] = value;
    }

    function setTrading(bool value) external onlyOwner {
        tradingPaused = value;
    }

    function clearListing(bytes32 listingId) external onlyAdmins {
        Listing memory listing = listings[listingId];
        _cleanupListing(listingId, listing.lister, listing.contractAddress, listing.tokenId);
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

    function setCollectionTrading(address ca, bool value) external onlyAdmins {
        collectionTradingEnabled[ca] = value;
        emit CollectionModified(ca, value, collectionOwners[ca], collectionOwnerFees[ca], block.timestamp);
    }

    function setCollectionOwner(address ca, address _owner) external onlyAdmins {
        collectionOwners[ca] = _owner;
        emit CollectionModified(ca, collectionTradingEnabled[ca], _owner, collectionOwnerFees[ca], block.timestamp);
    }

    // Either the collection owner or the contract owner can set fees.
    function setCollectionOwnerFee(address ca, uint256 fee) external {
        bool verifiedCollectionOwner = collectionOwnersCanSetRoyalties && (_msgSender() == collectionOwners[ca]);
        require((_msgSender() == owner()) || verifiedCollectionOwner);
        require(fee <= 1000, "Max 10% fee");
        collectionOwnerFees[ca] = fee;
        emit CollectionModified(ca, collectionTradingEnabled[ca], collectionOwners[ca], collectionOwnerFees[ca], block.timestamp);
    }

    function setDefaultCollectionOwnerFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        defaultCollectionOwnerFee = fee;
    }

    function setFeesOn(bool _value) external onlyOwner {
        feesOn = _value;
    }

    function setUsersCanWithdrawEscrow(bool _value) external onlyAdmins {
        usersCanWithdrawEscrow = _value;
    }

    function setCollectionOwnersCanSetRoyalties(bool _value) external  onlyOwner {
        collectionOwnersCanSetRoyalties = _value;
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

    function totalAdminFees() public view returns(uint256 totalFee) {
        totalFee = BeanFeeProcessor.totalFee();
    }

    // Emergency only - Recover Tokens
    function recoverToken(address _token, uint256 amount) external onlyOwner {
        IERC20(_token).transfer(owner(), amount);
    }

    // Emergency only - Recover NFTs
    function recoverNFT(address _token, uint256 tokenId) external onlyOwner {
        IERC721(_token).transferFrom(address(this), owner(), tokenId);
    }

    // Emergency only - Recover ETH
    function RecoverETH(address to, uint256 amount) external onlyOwner {
        payable(to).transfer(amount);
    }

    //---------------------------------
    //
    //     PRIVATE HELPERS
    //
    //---------------------------------

    /**
    * @dev This function requires that listingsByLister[address] and listingsByContract[address] must have
    * a length of at least one. This should always be true, as when listToken() is called it pushes an entry
    * to both arrays. No other functions delete from or manage the ordering of arrays, so for a non-zero
    * listingId, listingsByLister[address] and listingsByContract[address] will ALWAYS have an entry.
    * 
    * @dev Called when an existing active listing needs to be removed or replaced, and cleans up stored listing data.
    */
    function _cleanupListing(bytes32 listingId, address oldOwner, address listingAddress, uint256 listingTokenId) internal {
        //Get the position of this listing in both listing arrays (user/collection)
        ListingPos memory listingPos_ = posInListings[listingId];
        bytes32 listingHashToReplace;

        // 1. Handle updating the array that tracks all of a user's listings.
        uint256 lastListerIndex = listingsByLister[oldOwner].length-1;

        // Get the last listing hash in the array
        listingHashToReplace = listingsByLister[oldOwner][lastListerIndex];
        // Move the last listing hash to the replacement position, and shorten the array.
        listingsByLister[oldOwner].swapPop(listingPos_.posInListingsByLister);

        // If we have something still in the array, need to update posInListings.
        if (listingsByLister[oldOwner].length > 0) {
            posInListings[listingHashToReplace].posInListingsByLister = listingPos_.posInListingsByLister;
        }

        // 2. Handle updating the array that tracks all of a collection's listings.
        uint256 lastContractIndex = listingsByContract[listingAddress].length-1;

        // Get the last listing hash in the array
        listingHashToReplace = listingsByContract[listingAddress][lastContractIndex];
        // Move the last listing hash to the replacement position, and shorten the array.
        listingsByContract[listingAddress].swapPop(listingPos_.posInListingsByContract);

        // If we have something still in the array, need to update posInListings.
        if (listingsByContract[listingAddress].length > 0) {
            posInListings[listingHashToReplace].posInListingsByContract = listingPos_.posInListingsByContract;
        }

        // 3. Finally, delete the listing hash that we no longer care about.
        delete listings[listingId];
        delete currentListingOrderHash[listingAddress][listingTokenId];
        delete posInListings[listingId];
        
    }

    // Handle storing and emitting an event for a new escrowed offer (eth/weth)
    function _processEscrowOffer(address ca, uint256 tokenId, uint256 expiry, uint256 price) internal {
        if (price > SMOL_MAX_INT || expiry > SMOL_MAX_INT) revert BEAN_IntegerOverFlow();
        if (tradingPaused) revert BEAN_TradingPaused();
        if (price == 0) revert BEAN_ZeroPrice();
        if (expiry != 0 && expiry < block.timestamp) revert BEAN_BadExpiry();

        totalEscrowedAmount += price;
        totalInEscrow[msg.sender] += price;

        // Calculate and store new offer.
        bytes32 offerHash = computeOrderHash(msg.sender, ca, tokenId, userNonces[msg.sender]);
        unchecked {++userNonces[msg.sender];}
        _storeOffer(offerHash, ca, msg.sender, tokenId, price, expiry, true);

        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash, IERC721(ca).ownerOf(tokenId));
    }

    // Process ETH trade (from offer).
    function _escrowedPurchase(IERC721 _nft, address ca, uint256 tokenId, uint256 price, address payable oldOwner, address payable newOwner) private {
        require(totalInEscrow[newOwner] >= price, "Buyer does not have enough money in escrow.");  
        require(totalEscrowedAmount >= price, "Escrow balance too low.");
        totalInEscrow[newOwner] -= price;
        totalEscrowedAmount -= price;

        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        _processFees(ca, price, oldOwner);
    }

    // Process WETH trade (from offer).
    function _tokenPurchase(IERC721 _nft, address ca, uint256 tokenId, uint256 price, address payable oldOwner, address payable newOwner) private {
        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        TOKEN.transferFrom(newOwner, address(this), price);
        TOKEN.withdraw(price);
        _processFees(ca, price, oldOwner);
    }

    // Add a new offer hash to data storage.
    function _storeOffer(bytes32 offerHash, address ca, address user, uint256 tokenId, uint256 price, uint256 expiry, bool escrowed) private {
        offers[offerHash] = Offer(tokenId, uint128(price), uint128(expiry), ca, user, escrowed);
        posInOffers[offerHash] = OfferPos(offerHashesByBuyer[user].length);
        offerHashesByBuyer[user].push(offerHash);
    }

    // Done dealing with this offer hash - clean up storage.
    function _cleanupOffer(bytes32 offerId, address offerer) internal {
        OfferPos memory offerPos_ = posInOffers[offerId];
        bytes32 offerHashToReplace;
        uint256 lastOffererIndex = offerHashesByBuyer[offerer].length-1;

        //Cleanup accessory mappings. We pass the mapping results directly to the swapPop function to save memory height.
        offerHashToReplace = offerHashesByBuyer[offerer][lastOffererIndex];
        offerHashesByBuyer[offerer].swapPop(offerPos_.posInOffersByOfferer);
        if (offerHashesByBuyer[offerer].length > 0) {
            posInOffers[offerHashToReplace].posInOffersByOfferer = offerPos_.posInOffersByOfferer;
        }
        delete offers[offerId];
        delete posInOffers[offerId];
    }

    // Who gets what
    function _calculateAmounts(address ca, uint256 amount) private view returns (uint256, uint256, uint256) {
        uint256 _collectionOwnerFee = collectionOwnerFees[ca] == 0
            ? defaultCollectionOwnerFee
            : collectionOwnerFees[ca];

        uint256 totalAdminFee = (amount * totalAdminFees()) / 10000;
        uint256 collectionOwnerFeeAmount = (amount * _collectionOwnerFee) / 10000;
        uint256 remainder = amount - (totalAdminFee + collectionOwnerFeeAmount);

        return (totalAdminFee, collectionOwnerFeeAmount, remainder);
    }

    // Pretty self explanatory tbh
    function _sendEth(address _address, uint256 _amount) private {
        (bool success, ) = _address.call{value: _amount}("");
        require(success, "Transfer failed.");
    }

    receive() external payable {}
}