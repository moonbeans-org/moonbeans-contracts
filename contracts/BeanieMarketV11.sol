//Custom NFT Marketplace Contract. From your favorite beans around - MoonBeans!

pragma solidity ^0.8.4;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BeanUtils.sol";

error BEANOwnerNotApproved();
error BEANNotAuthorized();
error BEANListingNotActive();
error BEANTradingPaused();
error BEANNotOwnerOrAdmin();

//General
error BEANZeroPrice();

//Offers
error BEANContractNotApproved();
error BEANUserTokensLow();
error BEANOfferArrayPosMismatch();
error BEANNoCancellableOffer();
error BEANEscrowAlreadyWithdrawn();

//TODO: Make autosend dev fees a flag

//Anyone can delist nfts that are not approved or have passed expiry

contract BeanieMarketV11 is IERC721Receiver, ReentrancyGuard, Ownable {
    using BeanUtils for bytes32[];

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
    uint256 public totalEscrowedAmount = 0;
    uint256 public specialTaxGas = 100000;

    uint256 public accruedDevFees;
    uint256 public accruedBeanieFees;
    uint256 public accruedBeanieBuyback;

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
    }

    struct Offer {
        uint256 tokenId;
        uint128 price;
        uint128 expiry;
        address contractAddress;
        address offerer;
        bool escrowed;
    }

    mapping(bytes32 => Listing) listings;
    mapping(address => bytes32[]) listingHashesByOfferer;

    //This may not actually be necessary.
    mapping(address => mapping(bytes32 => uint256)) posInListerArray;

    mapping(bytes32 => Offer) offers;
    mapping(address => bytes32[]) offerHashesByBuyer;

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
                listingHashesByOfferer[msg.sender].length
            )
        );

        listings[listingHash] = Listing(
            tokenId,
            uint128(price),
            uint128(expiry),
            ca,
            msg.sender
        );
        listingHashesByOfferer[msg.sender].push(listingHash);

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
        //TODO: Fix negation here
        if (
            !(msg.sender ==
                IERC721(listing.contractAddress).ownerOf(listing.tokenId) ||
                administrators[msg.sender] ||
                listing.expiry > block.timestamp)
        ) revert BEANOwnerNotApproved();

        delete listings[listingId];
        emit TokenDelisted(
            listing.contractAddress,
            listing.tokenId,
            listingId
        );
    }

    // Allows a buyer to buy at the listed price.
    function fulfillListing(bytes32 listingId) external payable nonReentrant {
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
        IERC721 token = IERC721(listing.contractAddress);

        //effects - remove listing
        delete listings[listingId];

        //Interaction - transfer NFT and process fees
        token.safeTransferFrom(oldOwner, msg.sender, listing.tokenId);
        (
            uint256 devFeeAmount,
            uint256 beanieHolderFeeAmount,
            uint256 beanBuybackFeeAmount,
            uint256 collectionOwnerFeeAmount,
            uint256 remainder
        ) = calculateAmounts(listing.contractAddress, listing.price);
        _sendEth(oldOwner, remainder);
        //Check that all went swimmingly
        require(
            token.ownerOf(listing.tokenId) == msg.sender,
            "NFT was not successfully transferred."
        );

        //fees
        if (feesOn) {
            _sendEth(
                collectionOwners[listing.contractAddress],
                collectionOwnerFeeAmount
            );
            if (autoSendDevFees) {
                _processDevFees(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
            } else {
                _accrueDevFees(devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount);
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
    function makeOffer(
        address ca,
        uint256 tokenId,
        uint256 price,
        uint256 expiry
    ) public {

        //FIXME: Can probably remove this. Trivial workaround having a second wallet.
        // require(msg.sender != IERC721(ca).ownerOf(tokenId), "Can not bid on your own NFT.");
        
        if (price == 0)
            revert BEANZeroPrice();
        if (IERC20(TOKEN).allowance(msg.sender, address(this)) < price)
            revert BEANContractNotApproved();
        if (IERC20(TOKEN).balanceOf(msg.sender) < price)
            revert BEANUserTokensLow();

        bytes32 offerHash = _storeOffer(ca, tokenId, price, expiry, false);

        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash);
    }

    function _storeOffer(
        address ca,
        uint256 tokenId,
        uint256 price,
        uint256 expiry,
        bool escrowed
    ) private returns(bytes32 offerHash) {
        //FIXME: futz around with this to see if we can shave off some gas later.
        offerHash = keccak256(
            abi.encode(
                ca,
                tokenId,
                msg.sender,
                offerHashesByBuyer[msg.sender].length
            )
        );

        offers[offerHash] = Offer(
            tokenId,
            uint128(price),
            uint128(expiry),
            ca,
            msg.sender,
            escrowed
        );

        offerHashesByBuyer[msg.sender].push(offerHash);
    }

    // Make an escrowed offer (checks balance of bidder, then holds the bid in the contract as an escrow).
    function makeEscrowedOffer(
        address ca,
        uint256 tokenId,
        uint256 price,
        uint256 expiry
    ) public payable nonReentrant {
        //FIXME: Can probably remove this. Trivial workaround having a second wallet.
        // require(msg.sender != IERC721(ca).ownerOf(tokenId), "Can not bid on your own NFT.");
        if (price == 0)
            revert BEANZeroPrice();
        require(
            msg.value == price,
            "The buyer did not send enough money for an escrowed offer."
        );
        totalEscrowedAmount += msg.value;
        totalInEscrow[msg.sender] += msg.value;

        bytes32 offerHash = _storeOffer(ca, tokenId, price, expiry, true);

        emit OfferPlaced(ca, tokenId, price, expiry, msg.sender, offerHash);
    }

    // Cancel an offer (escrowed or not). Could have gas issues if there's too many offers...
    function cancelOffer(
        bytes32 offerHash,
        uint256 posInOffererArray,
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
        if (offerHashesByBuyer[offer.offerer][posInOffererArray] != offerHash)
            revert BEANOfferArrayPosMismatch();

        offerHashesByBuyer[offer.offerer].swapPop(posInOffererArray);
        delete offers[offerHash];

        if (offer.escrowed && returnEscrow) {
            if (offer.price > totalInEscrow[offer.offerer])
                revert BEANEscrowAlreadyWithdrawn();
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
        bytes32 offerHash,
        uint256 posInOffererArray
    ) external nonReentrant {

        Offer memory offer = offers[offerHash];

        IERC721 _nft = IERC721(offer.contractAddress);
        require(
            msg.sender == _nft.ownerOf(offer.tokenId),
            "Only the owner of this NFT can accept an offer."
        );
        require(
            collectionTradingEnabled[offer.contractAddress],
            "Trading for this collection is not enabled."
        );

        if (tradingPaused) revert BEANTradingPaused();

        //Cleanup offer storage - abstract this to a function
        if (offerHashesByBuyer[offer.offerer][posInOffererArray] != offerHash)
            revert BEANOfferArrayPosMismatch();

        offerHashesByBuyer[offer.offerer].swapPop(posInOffererArray);
        delete offers[offerHash];

        // Actually perform trade
        address payable oldOwner = payable(address(msg.sender));
        address payable newOwner = payable(address(offer.offerer));
        if (offer.escrowed) {
            escrowedPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        } else {
            tokenPurchase(_nft, offer.contractAddress, offer.tokenId, offer.price, oldOwner, newOwner);
        }
    }

    // PUBLIC ESCROW FUNCTIONS
    //TODO: fix this
    // function addMoneyToEscrow() external payable nonReentrant {
    //     require(
    //         msg.value >= 10000000 gwei,
    //         "Minimum escrow deposit is 0.01 MOVR."
    //     );
    //     totalEscrowedAmount += msg.value;
    //     totalInEscrow[msg.sender] += msg.value;
    // }

    // function withdrawMoneyFromEscrow(uint256 amount) external nonReentrant {
    //     require(
    //         totalInEscrow[msg.sender] >= amount,
    //         "Trying to withdraw more than deposited."
    //     );
    //     returnEscrowedFunds(msg.sender, amount);
    // }

    function getEscrowedAmount(address user) external view returns (uint256) {
        return totalInEscrow[user];
    }

    // DEV FEE PROCESSING

        function _processDevFees(
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanieBuybackAmount
    ) private {
        _sendEth(devAddress, devAmount);
        _sendEth(beanieHolderAddress, beanieHolderAmount);
        _sendEth(beanBuybackAddress, beanieBuybackAmount);
    }

    function _accrueDevFees(
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanieBuybackAmount
    ) private {
        accruedDevFees += devAmount;
        accruedBeanieFees += beanieHolderAmount;
        accruedBeanieBuyback += beanieBuybackAmount;
    }

    //Leave 1 in each slot for gas savings
    function processDevFees() external onlyAdmins() {
        uint256 devFeeAmount = accruedDevFees - 1;
        uint256 beanieFeeAmount = accruedBeanieFees - 1;
        uint256 beanieBuybackAmount = accruedBeanieBuyback - 1;

        accruedDevFees =  accruedDevFees - devFeeAmount;
        accruedBeanieFees =  accruedBeanieFees - beanieFeeAmount;
        accruedBeanieBuyback =  accruedBeanieBuyback - beanieBuybackAmount;

        _processDevFees(devFeeAmount, beanieFeeAmount, beanieBuybackAmount);
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
        uint256 oldOwnerMovrBalance = oldOwner.balance;

        //calculate fees
        (
            uint256 devFeeAmount,
            uint256 beanieHolderFeeAmount,
            uint256 beanBuybackFeeAmount,
            uint256 collectionOwnerFeeAmount,
            uint256 remainder
        ) = calculateAmounts(ca, price);
        totalInEscrow[newOwner] -= price;
        totalEscrowedAmount -= price;

        //swippity swappity
        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        oldOwner.transfer(remainder);

        //check that all went swimmingly
        require(
            oldOwner.balance >= (oldOwnerMovrBalance + remainder),
            "Funds were not successfully sent."
        );
        require(
            _nft.ownerOf(tokenId) == newOwner,
            "NFT was not successfully transferred."
        );
        emit TokenPurchased(oldOwner, newOwner, price, ca, tokenId);

        //fees
        if (feesOn) {
            _sendEth(collectionOwners[ca], collectionOwnerFeeAmount);
            if (autoSendDevFees) {
                _sendEth(devAddress, devFeeAmount);
                _sendEth(beanieHolderAddress, beanieHolderFeeAmount);
                _sendEth(beanBuybackAddress, beanBuybackFeeAmount);
            } else {
                accruedDevFees += devFeeAmount;
                accruedBeanieFees += beanieHolderFeeAmount;
                accruedBeanieBuyback += beanBuybackFeeAmount;
            }
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
        require(
            _token.balanceOf(msg.sender) >= price,
            "Buyer does not have enough money to purchase."
        );
        require(
            _token.allowance(newOwner, address(this)) >= price,
            "Marketplace not approved to spend buyer tokens."
        );
        (
            uint256 devFeeAmount,
            uint256 beanieHolderFeeAmount,
            uint256 beanBuybackFeeAmount,
            uint256 collectionOwnerFeeAmount,
            uint256 remainder
        ) = calculateAmounts(ca, price);

        _nft.safeTransferFrom(oldOwner, newOwner, tokenId);
        _token.transferFrom(newOwner, oldOwner, remainder);

        require(
            _token.balanceOf(oldOwner) >= remainder,
            "Funds were not successfully sent."
        );
        require(
            _nft.ownerOf(tokenId) == newOwner,
            "NFT was not successfully transferred."
        );
        emit TokenPurchased(oldOwner, newOwner, price, ca, tokenId);

        //fees
        if (feesOn) {
            _token.transferFrom(
                address(this),
                collectionOwners[ca],
                collectionOwnerFeeAmount
            );
            _token.transferFrom(address(this), devAddress, devFeeAmount);
            _token.transferFrom(
                address(this),
                beanieHolderAddress,
                beanieHolderFeeAmount
            );
            _token.transferFrom(
                address(this),
                beanBuybackAddress,
                beanBuybackFeeAmount
            );
        }
    }

    // function _clearAllBids(address ca, uint256 tokenId) internal {
    //     Offer[] storage _offers = _getOffers(ca, tokenId);
    //     for (uint256 i = 0; i < _offers.length; ) {
    //         if (_offers[i].accepted == false) {
    //             if (_offers[i].escrowed)
    //                 returnEscrowedFunds(_offers[i].buyer, _offers[i].price);
    //             emit BidCancelled(
    //                 ca,
    //                 tokenId,
    //                 _offers[i].price,
    //                 _offers[i].buyer,
    //                 _offers[i].escrowed,
    //                 block.timestamp
    //             );
    //         }
    //         unchecked {
    //             i++;
    //         }
    //     }
    //     delete offers[ca][tokenId];
    // }

    // function _clearSomeBids(
    //     address ca,
    //     uint256 tokenId,
    //     uint256 maxBidsToClear,
    //     bool wipeEm
    // ) internal {
    //     Offer[] storage _offers = _getOffers(ca, tokenId);

    //     for (uint256 i = 0; i < maxBidsToClear; ) {
    //         if (_offers[i].accepted == false) {
    //             if (_offers[i].escrowed)
    //                 returnEscrowedFunds(_offers[i].buyer, _offers[i].price);
    //             emit BidCancelled(
    //                 ca,
    //                 tokenId,
    //                 _offers[i].price,
    //                 _offers[i].buyer,
    //                 _offers[i].escrowed,
    //                 block.timestamp
    //             );
    //         }
    //         unchecked {
    //             i++;
    //         }
    //     }

    //     if (wipeEm) delete offers[ca][tokenId];
    // }

    //View-only function for frontend filtering -- probably want to use this with .map() + wagmi's useContractReads()
    function isValidListing(address ca, uint256 tokenId)
        public
        view
        returns (bool isValid)
    {
        isValid = (listings[ca][tokenId].price != 0 &&
            IERC721(ca).ownerOf(tokenId) == listings[ca][tokenId].lister);
    }

    function _sendEth(address _address, uint256 _amount) private {
        (bool success, ) = _address.call{value: _amount}("");
        require(success, "Transfer failed.");
    }
}
