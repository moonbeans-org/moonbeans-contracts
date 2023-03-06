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

});