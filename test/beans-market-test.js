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

    // We also mint some tokens here just cause
    await dummyNFT.connect(addrs[0]).mint(addrs[0].address, 10);
    await dummyNFT.connect(addrs[1]).mint(addrs[1].address, 10);
    // Fixtures can return anything you consider useful for your tests
    return { beanieMarket, dummyNFT, owner, addrs };
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
    it.only("List token", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      const blockNum = await ethers.provider.getBlockNumber();
      const address0 = addrs[0];
      const address1 = addrs[1];

      await dummyNFT.connect(address0).setApprovalForAll(beanieMarket.address, true);
      await dummyNFT.connect(address1).setApprovalForAll(beanieMarket.address, true);

      await beanieMarket.connect(address0).listToken(dummyNFT.address, 1, ONE_ETH, blockNum + 10);
      let listingsByLister = await beanieMarket.getListingsByLister(address0.address);
      let listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);

      expect(listingsByLister.length).to.equal(1)
      expect(listingsByContract.length).to.equal(1)
      expect(listingsByLister[0]).to.equal(listingsByContract[0]);

      await beanieMarket.connect(address0).listToken(dummyNFT.address, 2, ONE_ETH, blockNum + 100);
      listingsByLister = await beanieMarket.getListingsByLister(address0.address);
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);

      expect(listingsByLister.length).to.equal(2)
      expect(listingsByContract.length).to.equal(2)
      expect(listingsByLister[1]).to.equal(listingsByContract[1]);


      await beanieMarket.connect(address1).listToken(dummyNFT.address, 11, ONE_ETH, blockNum + 1000);
      listingsByLister = await beanieMarket.getListingsByLister(address1.address);
      listingsByContract = await beanieMarket.getListingsByContract(dummyNFT.address);

      expect(listingsByLister[0]).to.equal(listingsByContract[2]);
      expect(listingsByLister.length).to.equal(1)
      expect(listingsByContract.length).to.equal(3)

    });
  
    it("Delist token", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      const address0 = addrs[0];

      await dummyNFT.connect(address0).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(address0).listToken(dummyNFT.address, 1, ONE_ETH);
      await beanieMarket.connect(address0).delistToken(dummyNFT.address, 1);
    });
  
    it("Fulfill listing", async function () {
      const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      const address0 = addrs[0];

      await dummyNFT.connect(address0).setApprovalForAll(beanieMarket.address, true);
      await beanieMarket.connect(address0).listToken(dummyNFT.address, 1, ONE_ETH);
  
      await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);
  
      await beanieMarket.connect(addrs[1]).fulfillListing(dummyNFT.address, 1, {value: ONE_ETH});
    });
  });
});
