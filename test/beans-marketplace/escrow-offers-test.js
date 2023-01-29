const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

function makeBigNum(num) {
    return ethers.BigNumber.from(num);
}

describe("Market Escrow Offers", function () {
  async function deployMarketAndNFTFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.deployed();

    for (let i = 0; i<5; i++) {
      await weth.connect(addrs[i]).deposit({value: ONE_ETH.mul(50)});
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

  async function deployMarketAndMakeEscrowOffersFixture() {
        const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.deployed();

    for (let i = 0; i<5; i++) {
      await weth.connect(addrs[i]).deposit({value: ONE_ETH.mul(50)});
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

    await beanieMarket.connect(addrs[2]).makeEscrowedOfferEth(
      dummyNFT.address,
      1,
      now + 100,
      {value: ONE_ETH}
    );
    await beanieMarket.connect(addrs[2]).makeEscrowedOfferEth(
      dummyNFT.address,
      1,
      now + 100,
      {value: ONE_ETH.mul(2)}
    );
    await beanieMarket.connect(addrs[2]).makeEscrowedOfferEth(
      dummyNFT.address,
      2,
      now + 1000,
      {value: ONE_ETH.mul(3)}
    );
    await beanieMarket.connect(addrs[3]).makeEscrowedOfferEth(
      dummyNFT.address,
      1,
      now + 10000,
      {value: ONE_ETH}
    );
    await beanieMarket.connect(addrs[3]).makeEscrowedOfferEth(
      dummyNFT.address,
      3,
      now + 10000,
      {value: ONE_ETH}
    );

    return { beanieMarket, feeProcessor, dummyNFT, weth, owner, addrs, now };
  }

  describe("WETH9 test", function () {
    it("Can deposit and withdraw", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      weth.connect(addrs[0]).deposit({value: ONE_ETH});
      weth.connect(addrs[0]).withdraw(ONE_ETH);
    });
  });

  describe("escrow offers", function () {
    it("Make escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      //Check the storage structures of several listings. We do this for two different lister addresses to test.
      //TODO: maybe add a second contract address.

      let balBefore = await addrs[2].getBalance();
      let tx = await beanieMarket.connect(addrs[2]).makeEscrowedOfferEth(dummyNFT.address, 1, now + 10, {value: ONE_ETH}); // offer1
      let balAfter = await addrs[2].getBalance();
      let receipt = await tx.wait();
      let gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      expect(balAfter).to.eql(balBefore.sub(ONE_ETH).sub(gasSpent));

      const addr2Offers_1 = await beanieMarket.getOffersByOfferer(addrs[2].address)
      expect(addr2Offers_1.length).to.equal(1);

      //same params, make sure it works
      await beanieMarket.connect(addrs[2]).makeEscrowedOfferEth(dummyNFT.address, 1, now + 10, {value: ONE_ETH});
      const addr2Offers_2 = await beanieMarket.getOffersByOfferer(addrs[2].address)
      expect(addr2Offers_2.length).to.equal(2);
      expect(addr2Offers_2[0]).to.not.equal(addr2Offers_2[1]);

      //Offer for a different token
      balBefore = await addrs[2].getBalance();
      tx = await beanieMarket.connect(addrs[2]).makeEscrowedOfferEth(dummyNFT.address, 2, now + 100, {value: ONE_ETH.mul(2)}); //offer2
      balAfter = await addrs[2].getBalance();
      receipt = await tx.wait();
      gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      expect(balAfter).to.eql(balBefore.sub(ONE_ETH.mul(2)).sub(gasSpent));

      const addr2Offers_3 = await beanieMarket.getOffersByOfferer(addrs[2].address);
      expect(addr2Offers_3.length).to.equal(3);

      //3rd account makes an offer
      await beanieMarket.connect(addrs[3]).makeEscrowedOfferEth(dummyNFT.address, 1, now + 1000, {value: ONE_ETH}); //offer3
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
          true
        ]
      )

      expect(offer2).to.eql(
        [
          ethers.BigNumber.from(2),
          ONE_ETH.mul(2),
          ethers.BigNumber.from(now + 100),
          dummyNFT.address,
          addrs[2].address,
          true
        ]
      )

      expect(offer3).to.eql(
        [
          ethers.BigNumber.from(1),
          ONE_ETH,
          ethers.BigNumber.from(now + 1000),
          dummyNFT.address,
          addrs[3].address,
          true
        ]
      )
    });

    it("Making escrow offer ETH correctly updates token balances", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      await expect(beanieMarket.connect(addrs[2]).makeEscrowedOfferEth(dummyNFT.address, 1, now + 10, {value: ONE_ETH}))
        .to.changeEtherBalances(
          [addrs[2].address, beanieMarket.address], 
          [ONE_ETH.mul(-1), ONE_ETH]
          );
    })

    it("Making escrow offer token correctly updates token balances", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      await weth.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH);

      await expect(beanieMarket.connect(addrs[2]).makeEscrowedOfferTokens(dummyNFT.address, 1, now + 100, ONE_ETH))
        .to.changeTokenBalances(weth, [addrs[2].address, beanieMarket.address], [ONE_ETH.mul(-1), 0]);

      await weth.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH);
      await expect(beanieMarket.connect(addrs[2]).makeEscrowedOfferTokens(dummyNFT.address, 2, now + 100, ONE_ETH))
        .to.changeEtherBalances(
          [addrs[2].address, beanieMarket.address], 
          [0, ONE_ETH]
        );
    })

    //TODO: Chain offer fulfillment
    it("Fulfill escrow offer ownership change", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      const addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer0OldOwner = await dummyNFT.ownerOf(offer0Data.tokenId);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      expect(await dummyNFT.ownerOf(offer0Data.tokenId)).to.equal(offer0Data.offerer);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(offer1Hash);
      const offer1OldOwner = await dummyNFT.ownerOf(offer1Data.tokenId);

      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);
      expect(await dummyNFT.ownerOf(offer1Data.tokenId)).to.equal(offer1Data.offerer); 
    });

    it("Fulfill escrow offer update storage structures", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const addr2offersTail = await addr2offers[addr2offers.length - 1];
      const addr3offersTail = await addr3offers[addr3offers.length - 1];

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(offer0Hash);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(offer1Hash);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);
      expect(addr2offers).to.not.contain(offer0Hash)
      expect(addr3offers).to.not.contain(offer1Hash)

      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);

    });

    //TODO: reinspect these
    it("Fulfill escrow offer update storage structures (single length array)", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const addr2offersTail = await addr2offers[addr2offers.length - 1];
      const addr3offersTail = await addr3offers[addr3offers.length - 1];

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[0]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);
      expect(addr2offers).to.not.contain(offer0Hash)
      expect(addr3offers).to.not.contain(offer1Hash)

      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);

    });

    it("Fulfill escrow offer feesOff sends correct eth amount", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(false);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);

      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let newOwnerBalanceBefore = await addrs[2].getBalance();

      let tx = await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      let receipt = await tx.wait();
      let gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let oldOwnerBalanceAfter = await addrs[0].getBalance();
      let newOwnerBalanceAfter = await addrs[2].getBalance();

      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(gasSpent));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore);

      oldOwnerBalanceBefore = await addrs[0].getBalance();

      tx = await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);
      receipt = await tx.wait();
      gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      oldOwnerBalanceAfter = await addrs[0].getBalance();

      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(gasSpent));
    });

    it("Fulfill escrow feesOn sends correct token amount, autosend on", async function () {
      const { beanieMarket, feeProcessor, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(true);
      await feeProcessor.connect(owner).setAutoSendFees(true);

      const devFee = await feeProcessor.devFee();
      const beanieHolderFee = await feeProcessor.beanieHolderFee();
      const beanBuybackFee = await feeProcessor.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

      const devAddress = await feeProcessor.devAddress();
      const beanHolderAddress = await feeProcessor.beanieHolderAddress();
      const beanBuybackAddress = await feeProcessor.beanBuybackAddress();
      const collectionOwnerAddress = await beanieMarket.getCollectionOwner(dummyNFT.address);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer0price = offer0Data.price;

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);
      const offer1price = offer1Data.price;

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let collectionOwnerBalBefore = await ethers.provider.getBalance(collectionOwnerAddress);

      let tx = await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      let receipt = await tx.wait();
      let gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let oldOwnerBalanceAfter = await addrs[0].getBalance();
      let collectionOwnerBalAfter = await ethers.provider.getBalance(collectionOwnerAddress);

      let devFeeAmount = offer0price.mul(devFee).div(10000);
      let beanieHolderFeeAmount = offer0price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = offer0price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = offer0price.mul(collectionOwnerFee).div(10000);
      let afterFeePrice = offer0price.mul(totalFee).div(10000);

      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(offer0price).sub(afterFeePrice).sub(gasSpent));

      expect(await ethers.provider.getBalance(devAddress)).to.eql(devFeeAmount);
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(beanieHolderFeeAmount);
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(beanBuybackFeeAmount);
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));

      oldOwnerBalanceBefore = await addrs[0].getBalance();
      collectionOwnerBalBefore = await ethers.provider.getBalance(collectionOwnerAddress);

      tx = await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);
      receipt = await tx.wait();
      gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let devFeeAmount_1 = offer1price.mul(devFee).div(10000);
      let beanieHolderFeeAmount_1 = offer1price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount_1 = offer1price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount_1 = offer1price.mul(collectionOwnerFee).div(10000);
      let afterFeePrice_1 = offer1price.mul(totalFee).div(10000);

      oldOwnerBalanceAfter = await addrs[0].getBalance();
      collectionOwnerBalAfter = await ethers.provider.getBalance(collectionOwnerAddress);
      
      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(offer0price).sub(afterFeePrice_1).sub(gasSpent));

      expect(await ethers.provider.getBalance(devAddress)).to.eql(devFeeAmount.add(devFeeAmount_1));
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(beanieHolderFeeAmount.add(beanieHolderFeeAmount_1));
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(beanBuybackFeeAmount.add(beanBuybackFeeAmount_1));
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount_1));
    });

    it("Fulfill escrow feesOn sends correct token amount, autosend off and then process", async function () {
      const { beanieMarket, feeProcessor, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      await beanieMarket.connect(owner).setFeesOn(true);
      await feeProcessor.connect(owner).setAutoSendFees(false);

      const devFee = await feeProcessor.devFee();
      const beanieHolderFee = await feeProcessor.beanieHolderFee();
      const beanBuybackFee = await feeProcessor.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

      const devAddress = await feeProcessor.devAddress();
      const beanHolderAddress = await feeProcessor.beanieHolderAddress();
      const beanBuybackAddress = await feeProcessor.beanBuybackAddress();
      const collectionOwnerAddress = await beanieMarket.getCollectionOwner(dummyNFT.address);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      let addr3offers = await beanieMarket.getOffersByOfferer(addrs[3].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer0price = offer0Data.price;

      const offer1Hash = addr3offers[1];
      const offer1Data = await beanieMarket.offers(addr3offers[1]);
      const offer1price = offer1Data.price;

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let collectionOwnerBalBefore = await ethers.provider.getBalance(collectionOwnerAddress);

      let tx = await beanieMarket.connect(addrs[0]).acceptOffer(offer0Hash);
      let receipt = await tx.wait();
      let gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let oldOwnerBalanceAfter = await addrs[0].getBalance();
      let collectionOwnerBalAfter = await ethers.provider.getBalance(collectionOwnerAddress);

      let devFeeAmount = offer0price.mul(devFee).div(10000);
      let beanieHolderFeeAmount = offer0price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = offer0price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = offer0price.mul(collectionOwnerFee).div(10000);
      let afterFeePrice = offer0price.mul(totalFee).div(10000);

      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(offer0price).sub(afterFeePrice).sub(gasSpent));
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));
      expect(await ethers.provider.getBalance(devAddress)).to.eql(BIG_ZERO);
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(BIG_ZERO);
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(BIG_ZERO);

      await feeProcessor.connect(owner).processDevFeesEth();

      expect(await ethers.provider.getBalance(devAddress)).to.eql(devFeeAmount);
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(beanieHolderFeeAmount);
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(beanBuybackFeeAmount);

      oldOwnerBalanceBefore = await addrs[0].getBalance();
      collectionOwnerBalBefore = await ethers.provider.getBalance(collectionOwnerAddress);

      tx = await beanieMarket.connect(addrs[0]).acceptOffer(offer1Hash);
      receipt = await tx.wait();
      gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let devFeeAmount_1 = offer1price.mul(devFee).div(10000);
      let beanieHolderFeeAmount_1 = offer1price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount_1 = offer1price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount_1 = offer1price.mul(collectionOwnerFee).div(10000);
      let afterFeePrice_1 = offer1price.mul(totalFee).div(10000);

      oldOwnerBalanceAfter = await addrs[0].getBalance();
      collectionOwnerBalAfter = await ethers.provider.getBalance(collectionOwnerAddress);
      
      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(offer0price).sub(afterFeePrice_1).sub(gasSpent));
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount_1));

      await feeProcessor.connect(owner).processDevFeesEth();
      
      expect(await ethers.provider.getBalance(devAddress)).to.eql(devFeeAmount.add(devFeeAmount_1));
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(beanieHolderFeeAmount.add(beanieHolderFeeAmount_1));
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(beanBuybackFeeAmount.add(beanBuybackFeeAmount_1));
    });
  });

  describe("Make escrow offer errors", function() {
    it("Cannot make offer with zero price", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);
      await expect(beanieMarket.connect(addrs[0]).makeEscrowedOfferEth(dummyNFT.address, 4, now, {value: ethers.constants.Zero})
        ).to.be.revertedWithCustomError(beanieMarket, "BEAN_ZeroPrice");
    });

    it("Cannot make offer with expiry before now", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      await expect(beanieMarket.connect(addrs[0]).makeEscrowedOfferEth(dummyNFT.address, 4, now-1, {value: ONE_ETH})
        ).to.be.revertedWithCustomError(beanieMarket, "BEAN_BadExpiry");
      await expect(beanieMarket.connect(addrs[0]).makeEscrowedOfferEth(dummyNFT.address, 4, now, {value: ONE_ETH})
        ).to.be.revertedWithCustomError(beanieMarket, "BEAN_BadExpiry");
    });
  });

  describe("Fulfill escrow offer errors", function () {
    it("Cannot accept non-existent offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);
      await expect(beanieMarket.connect(addrs[2]).acceptOffer(ethers.utils.hexZeroPad(0x2, 32))
        ).to.be.revertedWithCustomError(beanieMarket, "BEAN_CollectionNotEnabled");
    });

    it("Cannot accept offer past expiry", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

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
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      const addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      const offer0Hash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
      await expect(beanieMarket.connect(addrs[5]).acceptOffer(offer0Hash)
        ).to.be.revertedWithCustomError(beanieMarket, "BEAN_CallerNotOwner");
    });

  });

  describe("Cancel escrow offer", function () {
    it("Offerer can cancel escrow offer, offerer recieves escrow back", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];
      const offer0Data = await beanieMarket.offers(addr2offers[0]);
      const offer0price = offer0Data.price;

      let offererBalanceBefore = await addrs[2].getBalance();

      let tx = await beanieMarket.connect(addrs[2]).cancelOffer(offerHash);
      let receipt = await tx.wait();
      let gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let offererBalanceAfter = await addrs[2].getBalance();

      expect(offererBalanceAfter).to.eql(offererBalanceBefore.add(offer0price).sub(gasSpent));

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    it("Offerer can cancel escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];

      await expect(beanieMarket.connect(addrs[2]).cancelOffer(offerHash)).to.changeEtherBalances(
        [addrs[2].address], [ONE_ETH]);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    it("Token owner can cancel escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];

      await expect(beanieMarket.connect(addrs[0]).cancelOffer(offerHash)).to.changeEtherBalances(
        [addrs[2].address], [ONE_ETH]);;

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    it("Admin can cancel escrow offer", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

      let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
      const addr2offersTail = await addr2offers[addr2offers.length - 1];

      let offerHash = addr2offers[0];

      await expect(beanieMarket.connect(owner).cancelOfferAdmin(offerHash, true)).to.changeEtherBalances(
        [addrs[2].address], [ONE_ETH]);

      addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

      expect(addr2offers).to.not.contain(offerHash)
      expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
      expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    });

    // it("Anyone can cancel escrow offer if past expiry", async function () {
    //   const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

    //   let addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);
    //   const addr2offersTail = await addr2offers[addr2offers.length - 1];

    //   let offerHash = addr2offers[0];
    //   const offer0Data = await beanieMarket.offers(offerHash);
    //   const expiry = offer0Data.expiry

    //   await expect(beanieMarket.connect(addrs[5]).cancelOffer(offerHash)
    //     ).to.be.revertedWithCustomError(beanieMarket, "BEAN_NotAuthorized");

    //   await network.provider.send("evm_setNextBlockTimestamp", [Number(expiry) + 10])
    //   await network.provider.send("evm_mine")

    //   await expect(beanieMarket.connect(addrs[8]).cancelOffer(offerHash)).to.changeEtherBalances(
    //     [addrs[2].address], [ONE_ETH]);

    //   addr2offers = await beanieMarket.getOffersByOfferer(addrs[2].address);

    //   expect(addr2offers).to.not.contain(offerHash)
    //   expect(await beanieMarket.posInOffers(addr2offersTail)).to.eql(BIG_ZERO);
    //   expect(await beanieMarket.offers(offerHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, false]);
    // });
  });

  describe("Cancel escrow offer errors", function () {
    it("Address cannot cancel if not offerer, token owner, admin, or past expiry", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeEscrowOffersFixture);

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
