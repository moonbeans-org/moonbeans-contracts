const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");

describe("Beanie Market", function () {
  async function deployMarketAndNFTFixture() {
    const [owner, ...addrs] = await ethers.getSigners();

    const MARKET = await ethers.getContractFactory("BeanieMarketV11");
    const beanieMarket = await MARKET.deploy();
    await beanieMarket.deployed();

    const NFT = await ethers.getContractFactory("ERC721Mock");
    const dummyNFT = await NFT.deploy();
    await dummyNFT.deployed();

    await dummyNFT.connect(addrs[0]).mint(addrs[0].address, 10);
    await dummyNFT.connect(addrs[1]).mint(addrs[1].address, 10);

    const now = await ethers.provider.getBlockNumber();

    return { beanieMarket, dummyNFT, owner, addrs, now };
  }

  async function deployMarketAndListNFTsFixture() {
    const { beanieMarket, dummyNFT, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await dummyNFT.connect(addrs[1]).setApprovalForAll(beanieMarket.address, true);

    await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);

    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 1, ONE_ETH, now + 10);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 2, ONE_ETH, now + 100);
    await beanieMarket.connect(addrs[1]).listToken(dummyNFT.address, 11, ONE_ETH, now + 1000);

    return { beanieMarket, dummyNFT, owner, addrs, now };
  }

  describe("Deployment", function () {
    it("Deployment", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      expect(await beanieMarket.TOKEN()).to.equal("0xAcc15dC74880C9944775448304B263D191c6077F");
      expect(await dummyNFT.symbol()).to.equal("DUMMY")
      expect(await dummyNFT.balanceOf(addrs[0].address)).to.equal(10);
    });
  })

  describe("Listings", function () {

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

      await beanieMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
      expect(await dummyNFT.ownerOf(1)).to.equal(addrs[1].address);
      
      listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister1.length).to.equal(1)
      expect(listingsByLister0.length).to.equal(1)
      expect(listingsByContract.length).to.equal(2)

      expect(listingsByLister0).to.not.contain(listingToFulfill)
      expect(listingsByLister1).to.not.contain(listingToFulfill)
      expect(listingsByContract).to.not.contain(listingToFulfill)

    });

    it.only("Delist token", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndListNFTsFixture);
      const address0 = addrs[0];
      const listingIds = await beanieMarket.getListingsByContract(dummyNFT.address);
      const listingToDelist = listingIds[0];

      await beanieMarket.connect(address0).delistToken(listingToDelist);

      let listingsByLister0 = await beanieMarket.getListingsByLister(addrs[0].address);
      let listingsByLister1 = await beanieMarket.getListingsByLister(addrs[1].address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);
      expect(listingsByLister0).to.not.contain(listingToDelist)
      expect(listingsByLister1).to.not.contain(listingToDelist)
      expect(listingsByContract).to.not.contain(listingToDelist)
    });
  });
});
