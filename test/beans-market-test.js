const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

describe("Beanie Market", function () {
  async function deployMarketAndNFTFixture() {
    const [owner, ...addrs] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const paymentToken = await ERC20.deploy();
    await paymentToken.deployed();

    for (let i = 0; i<3; i++) {
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

    const now = await ethers.provider.getBlockNumber();

    return { beanieMarket, dummyNFT, paymentToken, owner, addrs, now };
  }

  async function deployMarketAndListNFTsFixture() {
    const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await dummyNFT.connect(addrs[1]).setApprovalForAll(beanieMarket.address, true);

    await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);
    await beanieMarket.connect(owner).setCollectionOwner(dummyNFT.address, addrs[5].address);;
    await beanieMarket.connect(owner).setCollectionOwnerFee(dummyNFT.address, 100); //1% fee

    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 1, ONE_ETH, now + 10);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 2, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 3, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 4, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[1]).listToken(dummyNFT.address, 11, ONE_ETH, now + 1000);

    return { beanieMarket, dummyNFT, owner, addrs, now };
  }

  async function deployMarketAndMakeOffersFixture() {
    const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await dummyNFT.connect(addrs[1]).setApprovalForAll(beanieMarket.address, true);

    await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);
    await beanieMarket.connect(owner).setCollectionOwner(addrs[5].address);;
    await beanieMarket.connect(owner).setCollectionOwnerFee(dummyNFT.address, 100); //1% fee

    await paymentToken.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH.mul(10));

    let offerHashes = [];
    offerHashes.push(await beanieMarket.computeOfferHash(dummyNFT.address, addrs[2].address, 1))
    await beanieMarket.connect(addrs[2]).makeOffer(
      dummyNFT.address,
      1,
      ONE_ETH,
      now + 100
    );
    offerHashes.push(await beanieMarket.computeOfferHash(dummyNFT.address, addrs[2].address, 2))
    await beanieMarket.connect(addrs[2]).makeOffer(
      dummyNFT.address,
      2,
      ONE_ETH.mul(2),
      now + 100
    );
    offerHashes.push(await beanieMarket.computeOfferHash(dummyNFT.address, addrs[2].address, 3))
    await beanieMarket.connect(addrs[2]).makeOffer(
      dummyNFT.address,
      3,
      ONE_ETH.mul(3),
      now + 100
    );

    return { beanieMarket, dummyNFT, paymentToken, owner, addrs, now, offerHashes };
  }

  async function deployMarketAndMakeEscrowOffersFixture() {
    const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await dummyNFT.connect(addrs[1]).setApprovalForAll(beanieMarket.address, true);

    await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);
    await beanieMarket.connect(owner).setCollectionOwner(addrs[5].address);;
    await beanieMarket.connect(owner).setCollectionOwnerFee(dummyNFT.address, 100); //1% fee

    await paymentToken.connect(addrs[2]).approve(beanieMarket.address, ONE_ETH.mul(10));

    let offerHashes = [];
    offerHashes.push(await beanieMarket.computeOfferHash(dummyNFT.address, addrs[2].address, 1))
    await beanieMarket.connect(addrs[2]).makeEscrowedOffer(
      dummyNFT.address,
      1,
      ONE_ETH,
      now + 100,
      {value: ONE_ETH}
    );
    offerHashes.push(await beanieMarket.computeOfferHash(dummyNFT.address, addrs[2].address, 2))
    await beanieMarket.connect(addrs[2]).makeEscrowedOffer(
      dummyNFT.address,
      2,
      ONE_ETH.mul(2),
      now + 100,
      {value: ONE_ETH.mul(2)}
    );
    offerHashes.push(await beanieMarket.computeOfferHash(dummyNFT.address, addrs[2].address, 3))
    await beanieMarket.connect(addrs[2]).makeEscrowedOffer(
      dummyNFT.address,
      3,
      ONE_ETH.mul(3),
      now + 100,
      {value: ONE_ETH.mul(3)}
    );

    return { beanieMarket, dummyNFT, paymentToken, owner, addrs, now, offerHashes };
  }

  describe("Deployment", function () {
    it("Deployment", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      expect(await beanieMarket.TOKEN()).to.equal(paymentToken.address);
      expect(await dummyNFT.symbol()).to.equal("DUMMY")
      expect(await dummyNFT.balanceOf(addrs[0].address)).to.eql(ethers.BigNumber.from(10));
    });
  })

  describe.only("Listings", function () {
    it("List token and updated storage structures", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      const address0 = addrs[0];
      const address1 = addrs[1];

      await dummyNFT.connect(address0).setApprovalForAll(beanieMarket.address, true);
      await dummyNFT.connect(address1).setApprovalForAll(beanieMarket.address, true);

      //Check the storage structures of several listings. We do this for two different lister addresses to test.
      //TODO: maybe add a second contract address.
      await beanieMarket.connect(address0).listToken(dummyNFT.address, 1, ONE_ETH, now + 10);
      let listingsByLister = await beanieMarket.getListingsByLister(address0.address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister.length).to.equal(1)
      expect(listingsByContract.length).to.equal(1)
      expect(listingsByLister[0]).to.equal(listingsByContract[0]);
      expect(await beanieMarket.listings(listingsByLister[0])).to.eql(
        [
          ethers.BigNumber.from(1),
          ONE_ETH,
          ethers.BigNumber.from(now+10),
          dummyNFT.address,
          addrs[0].address,
          0,
          0
        ]
      )

      await beanieMarket.connect(address0).listToken(dummyNFT.address, 2, ONE_ETH, now + 100);
      listingsByLister = await beanieMarket.getListingsByLister(address0.address);
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister.length).to.equal(2)
      expect(listingsByContract.length).to.equal(2)
      expect(listingsByLister[1]).to.equal(listingsByContract[1]);
      expect(await beanieMarket.listings(listingsByLister[1])).to.eql(
        [
          ethers.BigNumber.from(2),
          ONE_ETH,
          ethers.BigNumber.from(now+100),
          dummyNFT.address,
          addrs[0].address,
          1,
          1
        ]
      )

      await beanieMarket.connect(address1).listToken(dummyNFT.address, 11, ONE_ETH, now + 1000);
      listingsByLister = await beanieMarket.getListingsByLister(address1.address);
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister[0]).to.equal(listingsByContract[2]);
      expect(listingsByLister.length).to.equal(1)
      expect(listingsByContract.length).to.equal(3)
      expect(await beanieMarket.listings(listingsByLister[0])).to.eql(
        [
          ethers.BigNumber.from(11),
          ONE_ETH,
          ethers.BigNumber.from(now+1000),
          dummyNFT.address,
          addrs[1].address,
          0,
          2
        ]
      )

    });
  
    it("Fulfill listing ownership change", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);
    });

    //When listing0 is fulfilled, new posInListingByLister[0] should be previous last listing

    it("Fulfill listing updates storage structures", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];

      let listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      let listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister0).to.contain(listingToFulfill)
      expect(listingsByContract).to.contain(listingToFulfill)
      expect(listingsByLister1).to.not.contain(listingToFulfill)

      const listingTailLister = await listingsByLister0[listingsByLister0.length - 1];
      const listingTailContract = await listingsByLister0[listingsByLister0.length - 1];

      //Fulfill listing

      await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);
      
      listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister0.length).to.equal(3)
      expect(listingsByLister1.length).to.equal(1)
      expect(listingsByContract.length).to.equal(4)

      //Make sure listing ID is removed from listingsByLister
      expect(listingsByLister0).to.not.contain(listingToFulfill)
      expect(listingsByLister1).to.not.contain(listingToFulfill)
      expect(listingsByContract).to.not.contain(listingToFulfill)

      //Check to see if new listingsByLister and listingsByContract is correct
      expect((await beanieMarket.listings(listingTailLister)).posInListingsByLister).to.equal(0);
      expect((await beanieMarket.listings(listingTailContract)).posInListingsByContract).to.equal(0);

      //Make sure old listing entry has been removed
      expect(await beanieMarket.listings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, 0, 0]);
    });

    it("Fulfill listing feesOff sends corrent eth amount", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];

      await beanieMarket.connect(owner).setFeesOn(false);

      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let newOwnerBalanceBefore = await addrs[1].getBalance();
      
      let tx = await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
      let receipt = await tx.wait();
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let oldOwnerBalanceAfter = await addrs[0].getBalance();
      let newOwnerBalanceAfter = await addrs[1].getBalance();
    
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH).sub(gasSpent));
      
      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);

    });

    it("Fulfill listing feesOn sends corrent token amount, autosend on", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];
      await beanieMarket.connect(owner).setAutoSendFees(true);

      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];

      const devFee = await beanieMarket.devFee();
      const beanieHolderFee = await beanieMarket.beanieHolderFee();
      const beanBuybackFee = await beanieMarket.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

      const devAddress = await beanieMarket.devAddress();
      const beanHolderAddress = await beanieMarket.beanieHolderAddress();
      const beanBuybackAddress = await beanieMarket.beanBuybackAddress();

      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let newOwnerBalanceBefore = await addrs[1].getBalance();
      let collectionOwnerBalBefore = await addrs[5].getBalance();

      let tx = await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
      let receipt = await tx.wait();
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let oldOwnerBalanceAfter = await addrs[0].getBalance();
      let newOwnerBalanceAfter = await addrs[1].getBalance();
      let collectionOwnerBalAfter = await addrs[5].getBalance();

      let devFeeAmount = ONE_ETH.mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = ONE_ETH.mul(collectionOwnerFee).div(10000);
      let afterFeePrice = ONE_ETH.mul(totalFee).div(10000);
      
      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(afterFeePrice));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH).sub(gasSpent));
      
      //Check fee balances
      expect(await ethers.provider.getBalance(devAddress)).to.eql(devFeeAmount);
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(beanieHolderFeeAmount);
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(beanBuybackFeeAmount);
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);

    });

    it("Fulfill listing feesOn sends corrent token amount, autosend off and then process", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];

      //Get fee percentages
      const devFee = await beanieMarket.devFee();
      const beanieHolderFee = await beanieMarket.beanieHolderFee();
      const beanBuybackFee = await beanieMarket.beanBuybackFee();
      const collectionOwnerFee = await beanieMarket.getCollectionFee(dummyNFT.address);
      const accruedAdminFees = devFee.add(beanieHolderFee).add(beanBuybackFee);
      const totalFee = accruedAdminFees.add(collectionOwnerFee);

      const devAddress = await beanieMarket.devAddress();
      const beanHolderAddress = await beanieMarket.beanieHolderAddress();
      const beanBuybackAddress = await beanieMarket.beanBuybackAddress();

      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let newOwnerBalanceBefore = await addrs[1].getBalance();
      let collectionOwnerBalBefore = await addrs[5].getBalance();

      let tx = await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
      let receipt = await tx.wait();
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      expect(await beanieMarket.accruedAdminFeesEth()).to.eql(ONE_ETH.mul(accruedAdminFees).div(10000));

      let oldOwnerBalanceAfter = await addrs[0].getBalance();
      let newOwnerBalanceAfter = await addrs[1].getBalance();
      let collectionOwnerBalAfter = await addrs[5].getBalance();

      let collectionOwnerFeeAmount = ONE_ETH.mul(collectionOwnerFee).div(10000);

      //Ensure collection owners always get auto-forwarded
      expect(await collectionOwnerBalAfter).to.eql(collectionOwnerBalBefore.add(collectionOwnerFeeAmount));

      //Check the rest of the fees
      expect(await ethers.provider.getBalance(devAddress)).to.eql(BIG_ZERO);
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(BIG_ZERO);
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(BIG_ZERO);

      await beanieMarket.connect(owner).processDevFeesEth();

      let devFeeAmount = ONE_ETH.mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(beanBuybackFee).div(10000).sub(1); //leaves 1 for gas savings
      let afterFeePrice = ONE_ETH.mul(totalFee).div(10000);
      
      //Check principal balances
      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(afterFeePrice));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH).sub(gasSpent));
      
      //Check fee balances
      expect(await ethers.provider.getBalance(devAddress)).to.eql(devFeeAmount);
      expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(beanieHolderFeeAmount);
      expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(beanBuybackFeeAmount);

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);

    });

    it("Delist token", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToDelist = listingIds[0];

      let listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      let listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);

      const listingTailLister = await listingsByLister0[listingsByLister0.length - 1];
      const listingTailContract = await listingsByLister0[listingsByLister0.length - 1];

      await beanieMarket.connect(address0).delistToken(listingToDelist);

      listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister0).to.not.contain(listingToDelist)
      expect(listingsByLister1).to.not.contain(listingToDelist)
      expect(listingsByContract).to.not.contain(listingToDelist)

      expect(listingsByLister0.length).to.equal(3)
      expect(listingsByLister1.length).to.equal(1)
      expect(listingsByContract.length).to.equal(4)

      //Check to see if new listingsByLister and listingsByContract is correct
      expect((await beanieMarket.listings(listingTailLister)).posInListingsByLister).to.equal(0);
      expect((await beanieMarket.listings(listingTailContract)).posInListingsByContract).to.equal(0);
      
    });
  });

  describe("offers", function () {
    it("Make non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now, offerHashes } = await loadFixture(deployMarketAndMakeOffersFixture);
      expect(await beanieMarket.geOffersByOfferer(addrs[2].address)).to.eql(offerHashes);
      expect(await beanieMarket.offers(offerHashes[0])).to.eql(
        [
          ethers.BigNumber.from(1),
          ONE_ETH,
          ethers.BigNumber.from(now+100),
          dummyNFT.address,
          addrs[2].address,
          0,
          false
        ]
      )
      expect(await beanieMarket.offers(offerHashes[1])).to.eql(
        [
          ethers.BigNumber.from(2),
          ONE_ETH.mul(2),
          ethers.BigNumber.from(now+100),
          dummyNFT.address,
          addrs[2].address,
          1,
          false
        ]
      )
      expect(await beanieMarket.offers(offerHashes[2])).to.eql(
        [
          ethers.BigNumber.from(3),
          ONE_ETH.mul(3),
          ethers.BigNumber.from(now+100),
          dummyNFT.address,
          addrs[2].address,
          2,
          false
        ]
      )
    });

    it("make non-escrow offer updates storage structures", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now, offerHashes } = await loadFixture(deployMarketAndMakeOffersFixture);
      
    });

    it("Fulfill non-escrow offer ownership change", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now, offerHashes } = await loadFixture(deployMarketAndMakeOffersFixture);

    });

    it("Fulfill non-escrow offer update storage structures", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now, offerHashes } = await loadFixture(deployMarketAndMakeOffersFixture);

    });

    it("Cancel non-escrow offer", async function () {
      const { beanieMarket, dummyNFT, paymentToken, owner, addrs, now, offerHashes } = await loadFixture(deployMarketAndMakeOffersFixture);

    });
  });
});
