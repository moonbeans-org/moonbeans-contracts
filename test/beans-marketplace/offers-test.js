const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

describe("Market Offers", function () {
  async function deployMarketAndNFTFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.deployed();

    for (let i = 0; i < 5; i++) {
      await weth.connect(addrs[i]).deposit({ value: ONE_ETH.mul(50) });
    }

    const FeeProcessor = await ethers.getContractFactory("BeanFeeProcessor");
    const feeProcessor = await FeeProcessor.deploy(weth.address);
    await feeProcessor.deployed();

    const MARKET = await ethers.getContractFactory("BeanieMarketV11");
    const beanieMarket = await MARKET.deploy(weth.address, feeProcessor.address);
    await beanieMarket.deployed();

    const NFT = await ethers.getContractFactory("ERC721Mock");
    const dummyNFT = await NFT.deploy();
    await dummyNFT.deployed();

    await dummyNFT.connect(addrs[0]).mint(addrs[0].address, 10);
    await dummyNFT.connect(addrs[1]).mint(addrs[1].address, 10);

    await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);
    await beanieMarket.connect(owner).setCollectionOwner(dummyNFT.address, addrs[5].address);;
    await beanieMarket.connect(owner).setCollectionOwnerFee(dummyNFT.address, 100); //1% fee

    const block = await ethers.provider.getBlock();
    const now = block['timestamp']

    return { beanieMarket, feeProcessor, dummyNFT, weth, owner, admin, addrs, now };
  }

  async function deployMarketAndMakeOffersFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.deployed();

    for (let i = 0; i < 5; i++) {
      await weth.connect(addrs[i]).deposit({ value: ONE_ETH.mul(50) });
    }

    const FeeProcessor = await ethers.getContractFactory("BeanFeeProcessor");
    const feeProcessor = await FeeProcessor.deploy(weth.address);
    await feeProcessor.deployed();

    const MARKET = await ethers.getContractFactory("BeanieMarketV11");
    const beanieMarket = await MARKET.deploy(weth.address, feeProcessor.address);
    await beanieMarket.deployed();

    const NFT = await ethers.getContractFactory("ERC721Mock");
    const dummyNFT = await NFT.deploy();
    await dummyNFT.deployed();

    await dummyNFT.connect(addrs[0]).mint(addrs[0].address, 10);
    await dummyNFT.connect(addrs[1]).mint(addrs[1].address, 10);

    await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);
    await beanieMarket.connect(owner).setCollectionOwner(dummyNFT.address, addrs[5].address);;
    await beanieMarket.connect(owner).setCollectionOwnerFee(dummyNFT.address, 100); //1% fee

    const block = await ethers.provider.getBlock();
    const now = block['timestamp']
    await weth.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH.mul(10));
    await weth.connect(addrs[3]).approve(beanieMarket.address, ONE_ETH.mul(10));
    await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 2, ONE_ETH, now + 1000);
    await beanieMarket.connect(addrs[3]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 10000);
    await beanieMarket.connect(addrs[3]).makeOffer(dummyNFT.address, 3, ONE_ETH, now + 10000);

    return { beanieMarket, feeProcessor, dummyNFT, weth, owner, addrs, now };
  }

  describe("Make non-escrow offer errors", function () {
    it("Cannot make offer with zero price", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, 0, now)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_ZeroPrice");
    });

    it("Cannot make offer if contract is not approved", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, ONE_ETH, now)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_ContractNotApproved");
    });

    it("Cannot make offer if account does not own enough weth", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      await weth.connect(addrs[11]).approve(beanieMarket.address, ethers.constants.MaxUint256);

      await expect(beanieMarket.connect(addrs[11]).makeOffer(dummyNFT.address, 4, ONE_ETH, now)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_UserTokensLow");
    });

    it("Cannot make offer with expiry before now", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      await weth.connect(addrs[0]).approve(beanieMarket.address, ethers.constants.MaxUint256);

      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, ONE_ETH, now - 1)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_BadExpiry");
      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, ONE_ETH, now)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_BadExpiry");
    });
  });

  describe("non-escrow offers", function () {

    it("Make non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      //Check the storage structures of several listings. We do this for two different lister addresses to test.
      //TODO: maybe add a second contract address.
      await weth.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH.mul(10));
      await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 10); // offer1

      const addr2Offers_1 = await beanieMarket.getOffersByOfferer(addrs[2].address)
      expect(addr2Offers_1.length).to.equal(1);

      //same params, make sure it works
      await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 10);
      const addr2Offers_2 = await beanieMarket.getOffersByOfferer(addrs[2].address)
      expect(addr2Offers_2.length).to.equal(2);
      expect(addr2Offers_2[0]).to.not.equal(addr2Offers_2[1]);

      //Offer for a different token
      await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 2, ONE_ETH, now + 100); //offer2
      const addr2Offers_3 = await beanieMarket.getOffersByOfferer(addrs[2].address)
      expect(addr2Offers_3.length).to.equal(3);

      //3rd account makes an offer
      await weth.connect(addrs[3]).approve(beanieMarket.address, ONE_ETH.mul(10));
      await beanieMarket.connect(addrs[3]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 1000); //offer3
      const addr3Offers_1 = await beanieMarket.getOffersByOfferer(addrs[3].address);
      expect(addr3Offers_1.length).to.equal(1);

      const offer1 = await beanieMarket.offers(addr2Offers_3[0]);
      const offer2 = await beanieMarket.offers(addr2Offers_3[2]);
      const offer3 = await beanieMarket.offers(addr3Offers_1[0]);

      expect(offer1).to.eql(
        [
          ethers.BigNumber.from(1),
          ONE_ETH,
          ethers.BigNumber.from(now + 10),
          dummyNFT.address,
          addrs[2].address,
          false
        ]
      )

      expect(offer2).to.eql(
        [
          ethers.BigNumber.from(2),
          ONE_ETH,
          ethers.BigNumber.from(now + 100),
          dummyNFT.address,
          addrs[2].address,
          false
        ]
      )

      expect(offer3).to.eql(
        [
          ethers.BigNumber.from(1),
          ONE_ETH,
          ethers.BigNumber.from(now + 1000),
          dummyNFT.address,
          addrs[3].address,
          false
        ]
      )
    });

    it("Fulfill non-escrow offer ownership change", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      const addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer0OldOwner = await dummyNFT.ownerOf(offer0Data.tokenId);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      expect(await dummyNFT.ownerOf(offer0Data.tokenId)).to.equal(offer0Data.offerer);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);
      const offer1OldOwner = await dummyNFT.ownerOf(offer1Data.tokenId);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);
      expect(await dummyNFT.ownerOf(offer1Data.tokenId)).to.equal(offer1Data.offerer);
    });

    it("Fulfill non-escrow offer update storage structures", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const addr2offersTail = await addr2offers[addr2offers.length - 1];
      const addr3offersTail = await addr3offers[addr3offers.length - 1];

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);
      expect(addr2offers).to.not.contain(offer0Hash)
      expect(addr3offers).to.not.contain(offer1Hash)

      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);

    });

    it("Fulfill non-escrow offer update storage structures (single length array)", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const addr2offersTail = await addr2offers[addr2offers.length - 1];
      const addr3offersTail = await addr3offers[addr3offers.length - 1];

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);
      expect(addr2offers).to.not.contain(offer0Hash)
      expect(addr3offers).to.not.contain(offer1Hash)

      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);

    });

    it("Fulfill non-escrow offer feesOff sends correct eth amount", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(false);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(offer0Hash);
      const offer0price = offer0Data.price;

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(offer1Hash);
      const offer1price = offer1Data.price;

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);

      await expect(beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash)).to.changeEtherBalance(
        addrs[0], offer0price
      );

      await expect(beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash)).to.changeEtherBalance(
        addrs[0], offer1price
      );
    });

    it("Fulfill non-escrow feesOn sends correct token amount, autosend on", async function () {
      const { beanieMarket, feeProcessor, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(true);
      await feeProcessor.connect(owner).setAutoSendFees(true);

      const devAddress = await feeProcessor.devAddress();
      const beanHolderAddress = await feeProcessor.beanieHolderAddress();
      const beanBuybackAddress = await feeProcessor.beanBuybackAddress();
      const collectionOwnerAddress = await beanieMarket.getCollectionOwner(dummyNFT.address);

      const devFee = await feeProcessor.devFee();
      const beanieHolderFee = await feeProcessor.beanieHolderFee();
      const beanBuybackFee = await feeProcessor.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const totalAdminFee = await beanieMarket.totalAdminFees();
      const totalFee = totalAdminFee.add(collectionOwnerFee);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer0Price = offer0Data.price;

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);
      const offer1Price = offer1Data.price;

      let devFeeAmount = offer0Price.mul(devFee).div(10000);
      let beanieHolderFeeAmount = offer0Price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = offer0Price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = offer0Price.mul(collectionOwnerFee).div(10000);
      let totalAdminFeeAmount = offer0Price.mul(totalAdminFee).div(10000);
      let afterFeePrice = offer0Price.sub(offer0Price.mul(totalFee).div(10000));

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);

      await expect(beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash))
        .to.changeEtherBalances(
          [addrs[0].address, addrs[2].address, collectionOwnerAddress, devAddress, beanHolderAddress, beanBuybackAddress],
          [afterFeePrice, 0, collectionOwnerFeeAmount, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount]
        );

      await expect(beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash))
      .to.changeEtherBalances(
        [addrs[0].address, addrs[2].address, collectionOwnerAddress, devAddress, beanHolderAddress, beanBuybackAddress],
        [afterFeePrice, 0, collectionOwnerFeeAmount, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount]
      );
    });

    it("Fulfill non-escrow feesOn sends correct token amount, autosend off and then process", async function () {
      const { beanieMarket, feeProcessor, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(true);
      await feeProcessor.connect(owner).setAutoSendFees(false);

      const devFee = await feeProcessor.devFee();
      const beanieHolderFee = await feeProcessor.beanieHolderFee();
      const beanBuybackFee = await feeProcessor.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const totalAdminFee = await beanieMarket.totalAdminFees();
      const totalFee = totalAdminFee.add(collectionOwnerFee);

      const devAddress = await feeProcessor.devAddress();
      const beanHolderAddress = await feeProcessor.beanieHolderAddress();
      const beanBuybackAddress = await feeProcessor.beanBuybackAddress();
      const collectionOwnerAddress = await beanieMarket.getCollectionOwner(dummyNFT.address);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer0Price = offer0Data.price;

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);
      const offer1Price = offer1Data.price;

      let devFeeAmount = offer0Price.mul(devFee).div(10000);
      let beanieHolderFeeAmount = offer0Price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = offer0Price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = offer0Price.mul(collectionOwnerFee).div(10000);
      let totalAdminFeeAmount = offer0Price.mul(totalAdminFee).div(10000);
      let afterFeePrice = offer0Price.sub(offer0Price.mul(totalFee).div(10000));

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);

      await expect(beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash))
        .to.changeEtherBalances(
          [addrs[0].address, addrs[2].address, collectionOwnerAddress, feeProcessor.address, devAddress, beanHolderAddress, beanBuybackAddress],
          [afterFeePrice, 0, collectionOwnerFeeAmount, totalAdminFeeAmount, 0, 0, 0]
        );

      await expect(feeProcessor.connect(owner).processDevFeesEth())
        .to.changeEtherBalances(
          [feeProcessor.address, devAddress, beanHolderAddress, beanBuybackAddress],
          [totalAdminFeeAmount.mul(-1), devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount]
        );

      await expect(beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash))
        .to.changeEtherBalances(
          [addrs[0].address, addrs[2].address, collectionOwnerAddress, feeProcessor.address, devAddress, beanHolderAddress, beanBuybackAddress],
          [afterFeePrice, 0, collectionOwnerFeeAmount, totalAdminFeeAmount, 0, 0, 0]
        );

    });
  });

  describe("Fulfill non-escrow errors", function () {

    it("Cannot accept non-existent offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);
      await expect(beanieMarket.connect(addrs[2]).acceptOffer(ethers.utils.hexZeroPad(0x2, 32))
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_CollectionNotEnabled");
    });

    it("Cannot accept offer past expiry", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      const addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      await network.provider.send("evm_setNextBlockTimestamp", [Number(offer0Data.expiry) + 10])
      await network.provider.send("evm_mine")

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await expect(beanieMarket.connect(addrs[2]).acceptOffer(offer0Hash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_OrderExpired");
    });

    it("Cannot accept offer if not current token owner", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      const addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await expect(beanieMarket.connect(addrs[5]).acceptOffer(offer0Hash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_CallerNotOwner");
    });

  });

  describe("Cancel non-escrow offer", function () {
    it("Offerer can cancel non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];

      await beanieMarket.connect(addrs[2]).cancelOffer(offerHash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    it("Token owner can cancel non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];

      await beanieMarket.connect(addrs[0]).cancelOffer(offerHash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    it("Admin can cancel non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];

      await beanieMarket.connect(owner).cancelOfferAdmin(offerHash, true);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    // it("Anyone can cancel non-escrow offer if past expiry", async function () {
    //   const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

    //   let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
    //   const addr2offersTail = await addr2offers[addr2offers.length - 1];

    //   let offerHash = addr2offers[0];
    //   const offer0Data = await beanieMarket.offers(offerHash);
    //   const expiry = offer0Data.expiry

    //   await expect(beanieMarket.connect(addrs[5]).cancelOffer(offerHash)
    //   ).to.be.revertedWithCustomError(beanieMarket, "BEAN_NotAuthorized");

    //   await network.provider.send("evm_setNextBlockTimestamp", [Number(expiry) + 10])
    //   await network.provider.send("evm_mine")

    //   await beanieMarket.connect(addrs[8]).cancelOffer(offerHash);

    //   addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

    //   expect(addr2offers).to.not.contain(offerHash)
    //   expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
    //   expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    // });
  });

  describe("Cancel non-escrow offer errors", function () {
    it("Address cannot cancel if not offerer, token owner, admin, or past expiry", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(offerHash);
      const expiry = offer0Data.expiry

      await expect(beanieMarket.connect(addrs[5]).cancelOffer(offerHash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_NotAuthorized");
    });
  });
});
