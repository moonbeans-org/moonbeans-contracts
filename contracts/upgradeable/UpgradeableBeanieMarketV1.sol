//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.4;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol"; 
import "../BeanUtils.sol";

// import "hardhat/console.sol";

error BEANOwnerNotApproved();
error BEANNotAuthorized();
error BEANListingNotActive();
error BEANTradingPaused();
error BEANNotOwnerOrAdmin();
error BEANNoSelfOffer();

//General
error BEANZeroPrice();

//Offers
error BEANContractNotApproved();
error BEANUserTokensLow();
error BEANOfferArrayPosMismatch();
error BEANNoCancellableOffer();
error BEANCallerNotOwner();
error BEANNotEnoughInEscrow();

//Escrow
error BEANEscrowOverWithdraw();
error BEANZeroInEscrow();

/*
    TODO questions:
    Deprecate totalEscrowedAmount? Not necessary providing per-account escrow is robust.
*/

//Anyone can delist nfts that are not approved or have passed expiry

contract BeanieMarketV11 is IERC721ReceiverUpgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    using BeanUtils for bytes32[];
    using BeanUtils for address[];

    event TokenListed(
        address indexed token,
        uint256 indexed id,
        uint256 indexed price,
        uint256 expiry,
        bytes32 listingHash
    );
    event TokenDelisted(
        address indexed token,
        uint256 indexed id,
        bytes32 listingHash
    );
    event TokenPurchased(
        address indexed oldOwner,
        address indexed newOwner,
        uint256 indexed price,
        address collection,
        uint256 tokenId,
        bytes32 listingHash
    );
    event OfferPlaced(
        address indexed token,
        uint256 indexed id,
        uint256 indexed price,
        uint256 expiry,
        address buyer,
        bytes32 offerHash
    );
    event OfferCancelled(
        address indexed token,
        uint256 indexed id,
        uint256 indexed price,
        uint256 expiry,
        address buyer,
        bytes32 offerHash
    );
    event EscrowReturned(address indexed user, uint256 indexed price);

    // FIXME: change this to bips
    // Fees are out of 1000, to theoretically allow for 0.1 - 0.9% fees in the future.
    uint256 public devFee = 10; //1%
    uint256 public beanieHolderFee = 10; //1%
    uint256 public beanBuybackFee = 10; //1%
    uint256 public defaultCollectionOwnerFee = 0; //0%

    uint256 public accruedAdminFeesEth;
    uint256 public accruedAdminFees;
    uint256 public totalEscrowedAmount;

    address public TOKEN = 0xAcc15dC74880C9944775448304B263D191c6077F; //WGLMR
    address public devAddress = 0x24312a0b911fE2199fbea92efab55e2ECCeC637D;
    address public beanieHolderAddress =
        0x6e0fa1dC8E3e6510aeBF14fCa3d83C77a9780ecB;
    address public beanBuybackAddress =
        0xE9b8258668E17AFA5D09de9F10381dE5565dbDc0;

    struct Listing {
        uint256 tokenId;
        uint128 price;
        uint128 expiry;
        address contractAddress;
        address lister;
        uint32 posInListingsByLister;
        uint32 posInListingsByContract; 
    }

    struct Offer {
        uint256 tokenId;
        uint128 price;
        uint128 expiry;
        address contractAddress;
        address offerer;
        uint32 posInOffersByOfferer;
        bool escrowed;
    }

    mapping(bytes32 => Listing) public listings;
    mapping(address => bytes32[]) public listingsByLister;
    // mapping(bytes32 => uint256) posInListingsByLister;

    //This may not actually be necessary.
    mapping(address => bytes32[])public listingsByContract;
    // mapping(bytes32 => uint256) posInListingsByContract;

    mapping(bytes32 => Offer) public offers;
    mapping(address => bytes32[]) public offerHashesByBuyer;

    //This may not actually be necessary.
    // mapping(address => mapping(bytes32 => uint256)) posInBuyerArray;

    bool public tradingPaused = false;
    bool public useSuperGasTaxes = false;
    bool public feesOn = true;
    bool public autoSendDevFees = false;
    bool public delistAfterAcceptingOffer = true;
    bool public clearBidsAfterAcceptingOffer = false;
    bool public clearBidsAfterFulfillingListing = false;
    bool public collectionOwnersCanSetRoyalties = true;

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

    function initialize() public initializer {
        
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
        IERC721Upgradeable token = IERC721Upgradeable(ca);
        //FIXME: Is this necessary if contract has isApprovedForAll, since isApprovedForAll is called in context of msg.sender?
        require(
            msg.sender == token.ownerOf(tokenId),
            "Only the owner of a token can list it."
        );
        require(price != 0, "Cannot set price to 0.");
        require(
            token.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved to handle this users tokens."
        );

        //We reference listingHashesByOfferer as a form of nonced execution.
        //I know the direct sload of listingHashesByOfferer is ugly here, but it saves gas / memory height.
        //FIXME: futz around with this to see if we can shave off some gas later.
        bytes32 listingHash = keccak256(
            abi.encode(
                ca,
                tokenId,
                msg.sender,
                listingsByLister[msg.sender].length
            )
        );

        listings[listingHash] = Listing(
            tokenId,
            uint128(price),
            uint128(expiry),
            ca,
            msg.sender,
            uint32(listingsByLister[msg.sender].length),
            uint32(listingsByContract[ca].length)
        );
        listingsByLister[msg.sender].push(listingHash);
        listingsByContract[ca].push(listingHash);

        emit TokenListed(
            ca,
            tokenId,
            price,
            expiry,
            listingHash
        );
    }

    // Public wrapper around token delisting, requiring ownership to delist.
    // Tokens that have passed their expiry can also be delisted by anyone, following a gas token pattern.
    function delistToken(bytes32 listingId) public {
        Listing memory listing = listings[listingId];
        address owner = IERC721Upgradeable(listing.contractAddress).ownerOf(listing.tokenId);
        //TODO: Fix negation here
        if (
            !(
                msg.sender == owner ||
                administrators[msg.sender] ||
                listing.expiry > block.timestamp)
        ) revert BEANOwnerNotApproved();

        //effects - remove listing
        delete listings[listingId];
        //Cleanup accessory mappings. We pass the mapping results directly to the swapPop function to save memory height.
        listingsByLister[owner].swapPop(listing.posInListingsByLister);
        listingsByContract[listing.contractAddress].swapPop(listing.posInListingsByContract);

        emit TokenDelisted(
            listing.contractAddress,
            listing.tokenId,
            listingId
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

        //get current NFT owner, verify approval
        address oldOwner = listing.lister;
        //TODO: possible gas savings by reducing memory height
        IERC721Upgradeable token = IERC721Upgradeable(listing.contractAddress);

        //effects - remove listing
        delete listings[listingId];
        //Cleanup accessory mappings. We pass the mapping results directly to the swapPop function to save memory height.
        listingsByLister[oldOwner].swapPop(listing.posInListingsByLister);
        listingsByContract[listing.contractAddress].swapPop(listing.posInListingsByContract);

        //Interaction - transfer NFT and process fees
        token.safeTransferFrom(oldOwner, to, listing.tokenId);
        (
            uint256 devFeeAmount,
            uint256 beanieHolderFeeAmount,
            uint256 beanBuybackFeeAmount,
            uint256 collectionOwnerFeeAmount,
            uint256 saleNetFees
        ) = calculateAmounts(listing.contractAddress, listing.price);
        _sendEth(oldOwner, saleNetFees);
        //Check that all went swimmingly
        // require(
        //     token.ownerOf(listing.tokenId) == to,
        //     "NFT was not successfully transferred."
        // );

        //fees
        if (feesOn) {
            _sendEth( collectionOwners[listing.contractAddress], collectionOwnerFeeAmount);
            if (autoSendDevFees) {
                _processDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            } else {
                _accrueDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            }
        }
        emit TokenPurchased(
            oldOwner,
            msg.sender,
            listing.price,
            listing.contractAddress,
            listing.tokenId,
            listingId
        );
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
        // require(msg.sender != IERC721Upgradeable(ca).ownerOf(tokenId), "Can not bid on your own NFT.");
        if (price == 0)
            revert BEANZeroPrice();
        if (IERC20Upgradeable(TOKEN).allowance(msg.sender, address(this)) < price)
            revert BEANContractNotApproved();
        if (IERC20Upgradeable(TOKEN).balanceOf(msg.sender) < price)
            revert BEANUserTokensLow();
        bytes32 offerHash = computeOfferHash(ca, msg.sender, tokenId);
        _storeOffer(offerHash, ca, msg.sender, tokenId, price, expiry, false);
        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash);
    }

    // Make an escrowed offer (checks balance of bidder, then holds the bid in the contract as an escrow).
    function makeEscrowedOffer(
        address ca,
        uint256 tokenId,
        uint256 price,
        uint256 expiry
    ) public payable nonReentrant {
        //FIXME: Can probably remove this. Trivial workaround having a second wallet.
        // require(msg.sender != IERC721Upgradeable(ca).ownerOf(tokenId), "Can not bid on your own NFT.");
        if (price == 0)
            revert BEANZeroPrice();
        if ((totalInEscrow[msg.sender] + msg.value) < price)
            revert BEANNotEnoughInEscrow();

        totalEscrowedAmount += msg.value;
        totalInEscrow[msg.sender] += msg.value;
        
        bytes32 offerHash = computeOfferHash(ca, msg.sender, tokenId);
        _storeOffer(offerHash, ca, msg.sender, tokenId, price, expiry, true);

        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash);
    }

    function computeOfferHash(
        address ca,
        address user,
        uint256 tokenId
    ) public view returns (bytes32 offerHash) {
        return keccak256(
            abi.encode(
                ca,
                tokenId,
                user,
                offerHashesByBuyer[user].length
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
            uint32(offerHashesByBuyer[user].length),
            escrowed
        );
        offerHashesByBuyer[user].push(offerHash);
    }

    // Cancel an offer (escrowed or not). Could have gas issues if there's too many offers...
    function cancelOffer(
        bytes32 offerHash,
        bool returnEscrow
    ) external nonReentrant {
        Offer memory offer = offers[offerHash];
        //TODO: Test this because I always futz up my bools
        if (
            offer.offerer != msg.sender &&
            !administrators[msg.sender] &&
            offer.expiry < block.timestamp
        ) revert BEANNotAuthorized();
        if (offer.price == 0)
            revert BEANNoCancellableOffer();

        delete offers[offerHash];
        offerHashesByBuyer[offer.offerer].swapPop(offer.posInOffersByOfferer);

        if (offer.escrowed && returnEscrow) {
            if (offer.price > totalInEscrow[offer.offerer])
                revert BEANEscrowOverWithdraw();
            _returnEscrow(offer.offerer, offer.price);
        }
    }

    function _returnEscrow(address depositor, uint256 escrowAmount) private {
        totalEscrowedAmount -= escrowAmount;
        totalInEscrow[depositor] -= escrowAmount;
        _sendEth(depositor, escrowAmount); 
    }

    // Accept an active offer.
    function acceptOffer(
        bytes32 offerHash
    ) external nonReentrant {

        if (tradingPaused) revert BEANTradingPaused();

        Offer memory offer = offers[offerHash];

        IERC721Upgradeable _nft = IERC721Upgradeable(offer.contractAddress);
        if(msg.sender != _nft.ownerOf(offer.tokenId))
            revert BEANCallerNotOwner();
        require(
            collectionTradingEnabled[offer.contractAddress],
            "Trading for this collection is not enabled."
        );

        //Cleanup offer storage - abstract this to a function
        if (offerHashesByBuyer[offer.offerer][offer.posInOffersByOfferer] != offerHash)
            revert BEANOfferArrayPosMismatch();

        delete offers[offerHash];
        offerHashesByBuyer[offer.offerer].swapPop(offer.posInOffersByOfferer);

        // Actually perform trade
        address payable oldOwner = payable(address(msg.sender));
        address payable newOwner = payable(address(offer.offerer));
        if (offer.escrowed) {
            escrowedPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        } else {
            tokenPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        }
        emit TokenPurchased(oldOwner, newOwner, offer.price, offer.contractAddress, offer.tokenId, offerHash);
    }

    // PUBLIC ESCROW FUNCTIONS
    //TODO: fix this
    function addFundsToEscrow() external payable nonReentrant {
        totalEscrowedAmount += msg.value;
        totalInEscrow[msg.sender] += msg.value;
    }

    function withdrawFundsFromEscrow(uint256 amount) external nonReentrant {
        if (totalInEscrow[msg.sender] == 0)
            revert BEANZeroInEscrow();
        if (totalInEscrow[msg.sender] < amount)
            revert BEANEscrowOverWithdraw();
        _returnEscrow(msg.sender, amount);
    }

    function getEscrowedAmount(address user) external view returns (uint256) {
        return totalInEscrow[user];
    }

    // DEV FEE PROCESSING

    function _processDevFeesEth(
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanieBuybackAmount
    ) private {
        _sendEth(devAddress, devAmount);
        _sendEth(beanieHolderAddress, beanieHolderAmount);
        _sendEth(beanBuybackAddress, beanieBuybackAmount);
    }

    function _accrueDevFeesEth(
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanieBuybackAmount
    ) private {
        uint256 accruedFees = devAmount + beanieHolderAmount + beanieBuybackAmount;
        accruedAdminFeesEth += accruedFees;
    }

    //Leave 1 in each slot for gas savings
    function processDevFeesEth() external onlyAdmins() {
        uint256 denominator = devFee + beanieHolderFee + beanBuybackFee;
        uint256 devFeeAmount = accruedAdminFeesEth * devFee / denominator;
        uint256 beanieFeeAmount = accruedAdminFeesEth * beanieHolderFee / denominator;
        uint256 beanieBuybackAmount = ((accruedAdminFeesEth - devFeeAmount) - beanieFeeAmount) - 1;
        _processDevFeesEth(devFeeAmount, beanieFeeAmount, beanieBuybackAmount);
    }

    function _processDevFees(
        address from,
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanieBuybackAmount
    ) private {
        IERC20Upgradeable(TOKEN).transferFrom(from, devAddress, devAmount);
        IERC20Upgradeable(TOKEN).transferFrom(from, beanieHolderAddress, beanieHolderAmount);
        IERC20Upgradeable(TOKEN).transferFrom(from, beanBuybackAddress, beanieBuybackAmount);
    }

    function _accrueDevFees(
        address from,
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanieBuybackAmount
    ) private {
        uint256 accruedFees = devAmount + beanieHolderAmount + beanieBuybackAmount;
        IERC20Upgradeable(TOKEN).transferFrom(from, address(this), accruedFees);
        accruedAdminFees += accruedFees;
    }

    //Leave 1 accrued fees slot for gas savings
    function processDevFeesToken() external onlyAdmins() {
        uint256 denominator = devFee + beanieHolderFee + beanBuybackFee;
        uint256 devFeeAmount = accruedAdminFees * devFee / denominator;
        uint256 beanieFeeAmount = accruedAdminFees * beanieHolderFee / denominator;
        uint256 beanieBuybackAmount = ((accruedAdminFees - devFeeAmount) - beanieFeeAmount) - 1;
        _processDevFees(address(this), devFeeAmount, beanieFeeAmount, beanieBuybackAmount);
    }

    // OTHER PUBLIC FUNCTIONS
    function getCollectionOwner(address ca) external view returns (address) {
        return collectionOwners[ca];
    }

    function totalFees() public view returns (uint256) {
        return (devFee +
            beanieHolderFee +
            beanBuybackFee +
            defaultCollectionOwnerFee);
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

    function clearListing(bytes32 listingId) external onlyAdmins {
        delete listings[listingId];
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
        require(
            collectionTradingEnabled[ca] != value,
            "Already set to that value."
        );
        collectionTradingEnabled[ca] = value;
    }

    function setCollectionOwner(address ca, address owner) external onlyAdmins {
        collectionOwners[ca] = owner;
    }

    function setDevFee(uint256 fee) external onlyOwner {
        require(fee <= 100, "Max 10% fee");
        devFee = fee;
    }

    function setBeanieHolderFee(uint256 fee) external onlyOwner {
        require(fee <= 100, "Max 10% fee");
        beanieHolderFee = fee;
    }

    function setBeanBuyBackFee(uint256 fee) external onlyOwner {
        require(fee <= 100, "Max 10% fee");
        beanBuybackFee = fee;
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

    function setDelistAfterAcceptingOffer(bool _value) external onlyOwner {
        delistAfterAcceptingOffer = _value;
    }

    function setClearBidsAfterAcceptingOffer(bool _value) external onlyOwner {
        clearBidsAfterAcceptingOffer = _value;
    }

    function setClearBidsAfterFulfillingListing(bool _value)
        external
        onlyOwner
    {
        clearBidsAfterFulfillingListing = _value;
    }

    function setCollectionOwnersCanSetRoyalties(bool _value)
        external
        onlyOwner
    {
        collectionOwnersCanSetRoyalties = _value;
    }

    // Emergency only - Recover Tokens
    function recoverToken(address _token, uint256 amount) external onlyOwner {
        IERC20Upgradeable(_token).transfer(owner(), amount);
    }

    // Emergency only - Recover NFTs
    function recoverNFT(address _token, uint256 tokenId) external onlyOwner {
        IERC721Upgradeable(_token).transferFrom(address(this), owner(), tokenId);
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

    function geOffersByOfferer(address offerer) public view returns(bytes32[] memory) {
        return offerHashesByBuyer[offerer];
    }

    // PRIVATE HELPERS
    function calculateAmounts(address ca, uint256 amount)
        private
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint256 _collectionOwnerFee = collectionOwnerFees[ca] == 0
            ? defaultCollectionOwnerFee
            : collectionOwnerFees[ca];
        uint256 devFeeAmount = (amount * devFee) / 1000;
        uint256 beanieHolderFeeAmount = (amount * beanieHolderFee) / 1000;
        uint256 beanBuybackFeeAmount = (amount * beanBuybackFee) / 1000;
        uint256 collectionOwnerFeeAmount = (amount * _collectionOwnerFee) /
            1000;
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
        IERC721Upgradeable _nft,
        address ca,
        uint256 tokenId,
        uint256 price,
        address payable oldOwner,
        address payable newOwner
    ) private nonReentrant {
        require(
            totalInEscrow[newOwner] >= price,
            "Buyer does not have enough money in escrow."
        );
        require(totalEscrowedAmount >= price, "Escrow balance too low.");
        //calculate fees
        (
            uint256 devFeeAmount,
            uint256 beanieHolderFeeAmount,
            uint256 beanBuybackFeeAmount,
            uint256 collectionOwnerFeeAmount,
            uint256 remainder
        ) = calculateAmounts(ca, price);

        //update escrow amounts
        totalInEscrow[newOwner] -= price;
        totalEscrowedAmount -= price;

        //swippity swappity
        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        _sendEth(oldOwner, remainder);

        //fees
        if (feesOn) {
            _sendEth(collectionOwners[ca], collectionOwnerFeeAmount);
            if (autoSendDevFees) {
                _processDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            } else {
                _accrueDevFeesEth(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            }
        }
    }

    //FIXME: what do we do without feesOn
    function tokenPurchase(
        IERC721Upgradeable _nft,
        address ca,
        uint256 tokenId,
        uint256 price,
        address payable oldOwner,
        address payable newOwner
    ) private {
        IERC20Upgradeable _token = IERC20Upgradeable(TOKEN);
        (
            uint256 devFeeAmount,
            uint256 beanieHolderFeeAmount,
            uint256 beanBuybackFeeAmount,
            uint256 collectionOwnerFeeAmount,
            uint256 priceNetFees
        ) = calculateAmounts(ca, price);

        _token.transferFrom(newOwner, oldOwner, priceNetFees);
        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        //fees
        if (feesOn) {
            _token.transferFrom(
                address(this),
                collectionOwners[ca],
                collectionOwnerFeeAmount
            );
            if (autoSendDevFees) {
                _processDevFees(newOwner, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            } else {
                _accrueDevFees(newOwner, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            }
        }
    }

    //View-only function for frontend filtering -- probably want to use this with .map() + wagmi's useContractReads()
    // function isValidListing(address ca, uint256 tokenId)
    //     public
    //     view
    //     returns (bool isValid)
    // {
    //     isValid = (listings[ca][tokenId].price != 0 &&
    //         IERC721Upgradeable(ca).ownerOf(tokenId) == listings[ca][tokenId].lister);
    // }

    function _sendEth(address _address, uint256 _amount) private {
        (bool success, ) = _address.call{value: _amount}("");
        require(success, "Transfer failed.");
    }
}
