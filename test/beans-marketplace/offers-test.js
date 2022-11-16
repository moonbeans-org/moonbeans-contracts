const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

describe("Beanie Market", function () {
  async function deployMarketAndNFTFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const paymentToken = await ERC20.deploy();
    await paymentToken.deployed();

    for (let i = 0; i<5; i++) {
      paymentToken.mint(addrs[i].address, ONE_ETH.mul(100));
    }

    const MARKET = await ethers.getContractFactory("BeanieMarketV11");
    const beanieMarket = await MARKET.deploy(paymentToken.address);
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

    return { beanieMarket, dummyNFT, paymentToken, owner, admin, addrs, now };
  }

  async function deployMarketAndMakeOffersFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const paymentToken = await ERC20.deploy();
    await paymentToken.deployed();

    for (let i = 0; i<5; i++) {
      paymentToken.mint(addrs[i].address, ONE_ETH.mul(100));
    }

    const MARKET = await ethers.getContractFactory("BeanieMarketV11");
    const beanieMarket = await MARKET.deploy(paymentToken.address);
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
    await paymentToken.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH.mul(10));
    await paymentToken.connect(addrs[3]).approve(beanieMarket.address, ONE_ETH.mul(10));
    await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[2]).makeOffer(dummyNFT.address, 2, ONE_ETH, now + 1000);
    await beanieMarket.connect(addrs[3]).makeOffer(dummyNFT.address, 1, ONE_ETH, now + 10000);
    await beanieMarket.connect(addrs[3]).makeOffer(dummyNFT.address, 3, ONE_ETH, now + 10000);

    return { beanieMarket, dummyNFT, paymentToken, owner, addrs, now };
  }

  describe("Make non-escrow offer errors", function() {
    it("Cannot make offer with zero price", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, 0, now)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANZeroPrice");
    });

    it("Cannot make offer if contract is not approved", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, ONE_ETH, now)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANContractNotApproved");
    });

    it("Cannot make offer if account does not own enough paymentToken", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      await paymentToken.connect(addrs[11]).approve(beanieMarket.address, ethers.constants.MaxUint256);

      await expect(beanieMarket.connect(addrs[11]).makeOffer(dummyNFT.address, 4, ONE_ETH, now)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANUserTokensLow");
    });

    it("Cannot make offer with expiry before now", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      await paymentToken.connect(addrs[0]).approve(beanieMarket.address, ethers.constants.MaxUint256);

      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, ONE_ETH, now-1)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANBadExpiry");
      await expect(beanieMarket.connect(addrs[0]).makeOffer(dummyNFT.address, 4, ONE_ETH, now)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANBadExpiry");
    });
  });

  describe("non-escrow offers", function () {
    
    it("Make non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      //Check the storage structures of several listings. We do this for two different lister addresses to test.
      //TODO: maybe add a second contract address.
      await paymentToken.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH.mul(10));
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
      await paymentToken.connect(addrs[3]).approve(beanieMarket.address, ONE_ETH.mul(10));
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
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

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
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

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
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

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
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(false);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);

      let oldOwnerBalanceBefore = await paymentToken.balanceOf(addrs[0].address);
      let newOwnerBalanceBefore = await paymentToken.balanceOf(addrs[2].address);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);

      let oldOwnerBalanceAfter = await paymentToken.balanceOf(addrs[0].address);
      let newOwnerBalanceAfter = await paymentToken.balanceOf(addrs[2].address);

      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH));

      oldOwnerBalanceBefore = await paymentToken.balanceOf(addrs[0].address);
      newOwnerBalanceBefore = await paymentToken.balanceOf(addrs[3].address);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);

      oldOwnerBalanceAfter = await paymentToken.balanceOf(addrs[0].address);
      newOwnerBalanceAfter = await paymentToken.balanceOf(addrs[3].address);

      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH));
    });

    it("Fulfill non-escrow feesOn sends correct token amount, autosend on", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(true);
      await beanieMarket.connect(owner).setAutoSendFees(true);

      const devFee = await beanieMarket.devFee();
      const beanieHolderFee = await beanieMarket.beanieHolderFee();
      const beanBuybackFee = await beanieMarket.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

      const devAddress = await beanieMarket.devAddress();
      const beanHolderAddress = await beanieMarket.beanieHolderAddress();
      const beanBuybackAddress = await beanieMarket.beanBuybackAddress();
      const collectionOwnerAddress = await beanieMarket.getCollectionOwner(dummyNFT.address);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);

      let oldOwnerBalanceBefore = await paymentToken.balanceOf(addrs[0].address);
      let newOwnerBalanceBefore = await paymentToken.balanceOf(addrs[2].address);
      let collectionOwnerBalBefore = await paymentToken.balanceOf(collectionOwnerAddress);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);

      let oldOwnerBalanceAfter = await paymentToken.balanceOf(addrs[0].address);
      let newOwnerBalanceAfter = await paymentToken.balanceOf(addrs[2].address);
      let collectionOwnerBalAfter = await paymentToken.balanceOf(collectionOwnerAddress);

      let devFeeAmount = ONE_ETH.mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = ONE_ETH.mul(collectionOwnerFee).div(10000);
      let afterFeePrice = ONE_ETH.mul(totalFee).div(10000);

      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(afterFeePrice));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH));

      expect(await paymentToken.balanceOf(devAddress)).to.eql(devFeeAmount);
      expect(await paymentToken.balanceOf(beanHolderAddress)).to.eql(beanieHolderFeeAmount);
      expect(await paymentToken.balanceOf(beanBuybackAddress)).to.eql(beanBuybackFeeAmount);
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));

      oldOwnerBalanceBefore = await paymentToken.balanceOf(addrs[0].address);
      newOwnerBalanceBefore = await paymentToken.balanceOf(addrs[3].address);
      collectionOwnerBalBefore = await paymentToken.balanceOf(collectionOwnerAddress);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);

      oldOwnerBalanceAfter = await paymentToken.balanceOf(addrs[0].address);
      newOwnerBalanceAfter = await paymentToken.balanceOf(addrs[3].address);
      collectionOwnerBalAfter = await paymentToken.balanceOf(collectionOwnerAddress);

      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(afterFeePrice));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH));

      expect(await paymentToken.balanceOf(devAddress)).to.eql(devFeeAmount.mul(2));
      expect(await paymentToken.balanceOf(beanHolderAddress)).to.eql(beanieHolderFeeAmount.mul(2));
      expect(await paymentToken.balanceOf(beanBuybackAddress)).to.eql(beanBuybackFeeAmount.mul(2));
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));

    });

    it("Fulfill non-escrow feesOn sends correct token amount, autosend off and then process", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(true);
      await beanieMarket.connect(owner).setAutoSendFees(false);

      const devFee = await beanieMarket.devFee();
      const beanieHolderFee = await beanieMarket.beanieHolderFee();
      const beanBuybackFee = await beanieMarket.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

      const devAddress = await beanieMarket.devAddress();
      const beanHolderAddress = await beanieMarket.beanieHolderAddress();
      const beanBuybackAddress = await beanieMarket.beanBuybackAddress();
      const collectionOwnerAddress = await beanieMarket.getCollectionOwner(dummyNFT.address);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);

      let oldOwnerBalanceBefore = await paymentToken.balanceOf(addrs[0].address);
      let newOwnerBalanceBefore = await paymentToken.balanceOf(addrs[2].address);
      let collectionOwnerBalBefore = await paymentToken.balanceOf(collectionOwnerAddress);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);

      let oldOwnerBalanceAfter = await paymentToken.balanceOf(addrs[0].address);
      let newOwnerBalanceAfter = await paymentToken.balanceOf(addrs[2].address);
      let collectionOwnerBalAfter = await paymentToken.balanceOf(collectionOwnerAddress);

      let devFeeAmount = ONE_ETH.mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = ONE_ETH.mul(collectionOwnerFee).div(10000);
      let afterFeePrice = ONE_ETH.mul(totalFee).div(10000);

      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(afterFeePrice));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH));

      await beanieMarket.connect(owner).processDevFeesToken();

      expect(await paymentToken.balanceOf(devAddress)).to.eql(devFeeAmount);
      expect(await paymentToken.balanceOf(beanHolderAddress)).to.eql(beanieHolderFeeAmount);
      expect(await paymentToken.balanceOf(beanBuybackAddress)).to.eql(beanBuybackFeeAmount);
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));

      oldOwnerBalanceBefore = await paymentToken.balanceOf(addrs[0].address);
      newOwnerBalanceBefore = await paymentToken.balanceOf(addrs[3].address);
      collectionOwnerBalBefore = await paymentToken.balanceOf(collectionOwnerAddress);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);

      oldOwnerBalanceAfter = await paymentToken.balanceOf(addrs[0].address);
      newOwnerBalanceAfter = await paymentToken.balanceOf(addrs[3].address);
      collectionOwnerBalAfter = await paymentToken.balanceOf(collectionOwnerAddress);

      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(afterFeePrice));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH));

      await beanieMarket.connect(owner).processDevFeesToken();

      expect(await paymentToken.balanceOf(devAddress)).to.eql(devFeeAmount.mul(2));
      expect(await paymentToken.balanceOf(beanHolderAddress)).to.eql(beanieHolderFeeAmount.mul(2));
      expect(await paymentToken.balanceOf(beanBuybackAddress)).to.eql(beanBuybackFeeAmount.mul(2));
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));

    });
  });

  describe("Fulfill non-escrow errors", function () {

    it("Cannot accept non-existent offer", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);
      await expect(beanieMarket.connect(addrs[2]).acceptOffer(ethers.utils.hexZeroPad(0x2, 32))
        ).to.be.revertedWithCustomError(beanieMarket, "BEANCollectionNotEnabled");
    });

    it("Cannot accept offer past expiry", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      const addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      await network.provider.send("evm_setNextBlockTimestamp", [Number(offer0Data.expiry) + 10])
      await network.provider.send("evm_mine")

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await expect(beanieMarket.connect(addrs[2]).acceptOffer(offer0Hash)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANOrderExpired");
    });

    it("Cannot accept offer if not current token owner", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      const addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await expect(beanieMarket.connect(addrs[5]).acceptOffer(offer0Hash)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANCallerNotOwner");
    });

  });

  describe("Cancel non-escrow offer", function () {
    it("Offerer can cancel non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

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
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

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
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];

      await beanieMarket.connect(owner).cancelOffer(offerHash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    it("Anyone can cancel non-escrow offer if past expiry", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(offerHash);
      const expiry = offer0Data.expiry

      await expect(beanieMarket.connect(addrs[5]).cancelOffer(offerHash)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANNotAuthorized");

      await network.provider.send("evm_setNextBlockTimestamp", [Number(expiry) + 10])
      await network.provider.send("evm_mine")

      await beanieMarket.connect(addrs[8]).cancelOffer(offerHash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });
  });

  describe("Cancel non-escrow offer errors", function () {
    it("Address cannot cancel if not offerer, token owner, admin, or past expiry", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(offerHash);
      const expiry = offer0Data.expiry

      await expect(beanieMarket.connect(addrs[5]).cancelOffer(offerHash)
        ).to.be.revertedWithCustomError(beanieMarket, "BEANNotAuthorized");
    });
  });
});
