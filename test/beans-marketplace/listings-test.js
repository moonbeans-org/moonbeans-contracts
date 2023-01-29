const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

describe("Market Listings", function () {
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

  async function deployMarketAndListNFTsFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.deployed();

    for (let i = 0; i < 5; i++) {
      weth.connect(addrs[i]).deposit({ value: ONE_ETH.mul(50) });
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

    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await dummyNFT.connect(addrs[1]).setApprovalForAll(beanieMarket.address, true);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 1, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 2, ONE_ETH, now + 1000);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 3, ONE_ETH, now + 1000);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 4, ONE_ETH, now + 1000);
    await beanieMarket.connect(addrs[1]).listToken(dummyNFT.address, 11, ONE_ETH, now + 10000);

    return { beanieMarket, feeProcessor, dummyNFT, weth, owner, addrs, now };
  }

  describe("Deployment", function () {
    it("Deployment", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      expect(await beanieMarket.TOKEN()).to.equal(weth.address);
      expect(await dummyNFT.symbol()).to.equal("DUMMY")
      expect(await dummyNFT.balanceOf(addrs[0].address)).to.eql(ethers.BigNumber.from(10));
    });
  })

  describe("Make listings", function () {
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
          ethers.BigNumber.from(now + 10),
          dummyNFT.address,
          addrs[0].address
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
          ethers.BigNumber.from(now + 100),
          dummyNFT.address,
          addrs[0].address
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
          ethers.BigNumber.from(now + 1000),
          dummyNFT.address,
          addrs[1].address
        ]
      )

    });
  });

  describe("Admin clear listing", function () {
    it("Admin can clear listing", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToClear = listingIds[0];

      await beanieMarket.connect(owner).clearListing(listingToClear);

      let listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      let listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister0).to.not.contain(listingToClear)
      expect(listingsByContract).to.not.contain(listingToClear)
      expect(listingsByLister1).to.not.contain(listingToClear)
    });

    it("Revert clearListing call if caller not admin", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToClear = listingIds[0];

      await expect(beanieMarket.connect(addrs[0]).clearListing(listingToClear)).to.be.revertedWithCustomError(
        beanieMarket, "BEAN_NotOwnerOrAdmin"
      );
    });
  });

  describe("fulfill listings", function () {
    it("Fulfill listing ownership change", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, { value: ONE_ETH });

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);
    });

    it("Relist token", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 1, ONE_ETH.mul(2), now + 1000);
    });

    it("Relist token updates storage structures", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, { value: ONE_ETH });

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
      const listingTailContract = await listingsByContract[listingsByContract.length - 1];

      //Fulfill listing
      await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, { value: ONE_ETH });
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
      expect((await beanieMarket.posInListings(listingTailLister)).posInListingsByLister).to.eql(BIG_ZERO);
      expect((await beanieMarket.posInListings(listingTailContract)).posInListingsByContract).to.eql(BIG_ZERO);

      //Make sure old listing entry has been removed
      expect(await beanieMarket.listings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
      expect(await beanieMarket.posInListings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO]);
    });

    it("Fulfill listing updates storage structures (single-length listing array)", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(11)).to.equal(addrs[1].address);
      const listingIds = await beanieMarket.getListingsByLister(addrs[1].address);
      const listingToFulfill = listingIds[0];

      await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[2].address, { value: ONE_ETH });
      expect(await dummyNFT.ownerOf(11)).to.equal(addrs[2].address);
      expect(await beanieMarket.listings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
      expect(await beanieMarket.posInListings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO]);
    });

    it("Fulfill listing feesOff sends correct eth amount", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];

      await beanieMarket.connect(owner).setFeesOn(false);

      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let newOwnerBalanceBefore = await addrs[1].getBalance();

      let tx = await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, { value: ONE_ETH });
      let receipt = await tx.wait();
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      let oldOwnerBalanceAfter = await addrs[0].getBalance();
      let newOwnerBalanceAfter = await addrs[1].getBalance();

      expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH));
      expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH).sub(gasSpent));

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);

    });

    it("Fulfill listing feesOn sends correct token amount, autosend on", async function () {
      const { beanieMarket, feeProcessor, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];
      await feeProcessor.connect(owner).setAutoSendFees(true);

      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      const listingToFulfillData = await beanieMarket.listings(listingToFulfill);
      const listing0Price = listingToFulfillData.price;

      //Get fee percentages
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

      let devFeeAmount = listing0Price.mul(devFee).div(10000);
      let beanieHolderFeeAmount = listing0Price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = listing0Price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = listing0Price.mul(collectionOwnerFee).div(10000);
      let totalAdminFeeAmount = listing0Price.mul(totalAdminFee).div(10000);
      let afterFeePrice = listing0Price.sub(listing0Price.mul(totalFee).div(10000));
      
      await expect(beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, { value: listing0Price }))
      .to.changeEtherBalances(
        [addrs[0].address, addrs[1].address, collectionOwnerAddress, devAddress, beanHolderAddress, beanBuybackAddress, feeProcessor.address],
        [afterFeePrice, listing0Price.mul(-1), collectionOwnerFeeAmount, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount, 0]
      );

    });

    it("Fulfill listing feesOn sends correct token amount, autosend off and then process", async function () {
      const { beanieMarket, feeProcessor, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];
      await feeProcessor.connect(owner).setAutoSendFees(false);

      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      const listingToFulfillData = await beanieMarket.listings(listingToFulfill);
      const listing0Price = listingToFulfillData.price;

      //Get fee percentages
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

      let devFeeAmount = listing0Price.mul(devFee).div(10000);
      let beanieHolderFeeAmount = listing0Price.mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = listing0Price.mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = listing0Price.mul(collectionOwnerFee).div(10000);
      let totalAdminFeeAmount = listing0Price.mul(totalAdminFee).div(10000);
      let afterFeePrice = listing0Price.sub(listing0Price.mul(totalFee).div(10000));

      await expect(beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, { value: listing0Price }))
        .to.changeEtherBalances(
          [addrs[0].address, addrs[1].address, collectionOwnerAddress, devAddress, beanHolderAddress, beanBuybackAddress, feeProcessor.address],
          [afterFeePrice, listing0Price.mul(-1), collectionOwnerFeeAmount, 0, 0, 0, totalAdminFeeAmount]
        );

      await expect(feeProcessor.connect(owner).processDevFeesEth())
        .to.changeEtherBalances(
          [feeProcessor.address, devAddress, beanHolderAddress, beanBuybackAddress],
          [totalAdminFeeAmount.mul(-1), devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount]
        );

    });

    it("Delist token", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToDelist = listingIds[0];

      let listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      let listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister0.length).to.equal(4)
      expect(listingsByLister1.length).to.equal(1)
      expect(listingsByContract.length).to.equal(5)

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
      expect(await beanieMarket.listings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
      expect(await beanieMarket.posInListings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO]);
    });

    it("Delist token updates storage structures", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToDelist = listingIds[0];
      const listingData = await beanieMarket.listings(listingToDelist);

      let listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      let listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister0.length).to.equal(4)
      expect(listingsByLister1.length).to.equal(1)
      expect(listingsByContract.length).to.equal(5)
      expect(await beanieMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId))
        .to.equal(listingToDelist);
      await beanieMarket.connect(address0).delistToken(listingToDelist);

      //Check to see if new listingsByLister and listingsByContract is correct
      //Listings
      expect(await beanieMarket.listings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
      //posInListings
      expect(await beanieMarket.posInListings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO]);
      //listingsByLister
      listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      expect(listingsByLister0.length).to.equal(3)
      expect(listingsByLister1.length).to.equal(1)
      expect(listingsByLister0).to.not.contain(listingToDelist)
      expect(listingsByLister1).to.not.contain(listingToDelist)
      //listingsBycontract
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByContract).to.not.contain(listingToDelist)
      expect(listingsByContract.length).to.equal(4)
      //currentListingOrderHash
      expect(await beanieMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId))
        .to.equal(ethers.utils.hexZeroPad(0x0, 32));
    });

    it("Creating a new listing for same token removes old listing.", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingHash = listingIds[0];
      const listingData = await beanieMarket.listings(listingHash);
      const currentListingOrderHash = await beanieMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId);
      expect(currentListingOrderHash).to.equal(listingHash);

      await beanieMarket.connect(addrs[0]).listToken(listingData.contractAddress, listingData.tokenId, ONE_ETH, now + 100);

      const listingIdsNew = await beanieMarket.getListingsByContract(dummyNFT.address);
      const currentListingOrderHashNew = await beanieMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId);
      const listingDataNew = await beanieMarket.listings(currentListingOrderHashNew);

      //Old listing has been canceled
      expect(await beanieMarket.listings(listingHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO])
      expect(await beanieMarket.posInListings(listingHash)).to.eql([BIG_ZERO, BIG_ZERO]);

      expect(listingData.contractAddress, listingData.tokenId).to.equal(listingDataNew.contractAddress, listingDataNew.tokenId)
      expect(listingIdsNew).to.not.contain(currentListingOrderHash);
      expect(listingIdsNew).to.contain(currentListingOrderHashNew);
      expect(currentListingOrderHash).to.not.equal(currentListingOrderHashNew);
    });
  });

  describe("Fulfill listing token errors", function () {
    it("Cannot fulfill listing for an unlisted token", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      await expect(beanieMarket.connect(addrs[5]).fulfillListing(ethers.utils.hexZeroPad(0x2, 32), addrs[5].address)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_CollectionNotEnabled");
    });

    it("Cannot fulfill listing by sending too little ETH", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      const listingData = await beanieMarket.listings(listingToFulfill);

      await expect(beanieMarket.connect(addrs[5]).fulfillListing(
        listingToFulfill, addrs[1].address, { value: listingData.price.div(2) })
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_NotEnoughEthSent");
    });

    it("Cannot fulfill listing if past expiry", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      const listingData = await beanieMarket.listings(listingToFulfill);

      await network.provider.send("evm_setNextBlockTimestamp", [Number(listingData.expiry) + 10])
      await network.provider.send("evm_mine")

      await expect(beanieMarket.connect(addrs[5]).fulfillListing(
        listingToFulfill, addrs[1].address, { value: listingData.price })
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_OrderExpired");
    });

    it("Cannot fulfill listing if token owner has changed", async function () {
      const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];

      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[0].address);

      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToFulfill = listingIds[0];
      const listingData = await beanieMarket.listings(listingToFulfill);

      await dummyNFT.connect(addrs[0]).transferFrom(addrs[0].address, addrs[1].address, listingData.tokenId);

      await expect(beanieMarket.connect(addrs[5]).fulfillListing(
        listingToFulfill, addrs[4].address, { value: listingData.price })
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_ListingNotActive");
    });
  })

  describe("Delist token errors and delist cases", function () { // works, fixtures just break -- hh problem
    it("Cannot delist unowned token", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

      const listings = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listing0hash = listings[0];
      const listing0Data = await beanieMarket.listings(listing0hash);

      await expect(beanieMarket.connect(addrs[5]).delistToken(listing0hash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_DelistNotApproved");
    });

    it("Can delist unowned token if caller is admin", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

      const listings = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listing0hash = listings[0];
      const listing0Data = await beanieMarket.listings(listing0hash);

      await beanieMarket.connect(owner).delistToken(listing0hash);
    });

    it("Anyone can delist token if lister is no longer token owner.", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

      const listings = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listing0hash = listings[0];
      const listing0Data = await beanieMarket.listings(listing0hash);

      await expect(beanieMarket.connect(addrs[2]).delistToken(listing0hash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_DelistNotApproved");

      await dummyNFT.connect(addrs[0]).transferFrom(addrs[0].address, addrs[1].address, listing0Data.tokenId);
      await beanieMarket.connect(addrs[2]).delistToken(listing0hash);
    });

    it("Anyone can delist token if token is contract is no longer approved for all.", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

      const listings = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listing0hash = listings[0];
      const listing0Data = await beanieMarket.listings(listing0hash);

      await expect(beanieMarket.connect(addrs[2]).delistToken(listing0hash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_DelistNotApproved");

      await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, false);
      await beanieMarket.connect(addrs[2]).delistToken(listing0hash);
    });

    it("Anyone can delist token if expiry has passed.", async function () {
      const { beanieMarket, dummyNFT, weth, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

      const listings = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listing0hash = listings[0];
      const listing0Data = await beanieMarket.listings(listing0hash);

      await expect(beanieMarket.connect(addrs[2]).delistToken(listing0hash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_DelistNotApproved");

      await network.provider.send("evm_setNextBlockTimestamp", [Number(listing0Data.expiry) - 10])
      await network.provider.send("evm_mine")

      await expect(beanieMarket.connect(addrs[2]).delistToken(listing0hash)
      ).to.be.revertedWithCustomError(beanieMarket, "BEAN_DelistNotApproved");

      await network.provider.send("evm_setNextBlockTimestamp", [Number(listing0Data.expiry) + 10])
      await network.provider.send("evm_mine")

      await beanieMarket.connect(addrs[2]).delistToken(listing0hash);
    });
  });
});