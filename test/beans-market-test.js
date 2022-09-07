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
    // Fixtures can return anything you consider useful for your tests
    return { beanieMarket, dummyNFT, owner, addrs };
  }

  it("Deployment", async function () {
    const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
    expect(await beanieMarket.TOKEN()).to.equal("0xAcc15dC74880C9944775448304B263D191c6077F");
    expect(await dummyNFT.symbol()).to.equal("DUMMY")
    expect(await dummyNFT.balanceOf(addrs[0].address)).to.equal(10);
  });

  it("List token", async function () {
    const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 1, ONE_ETH);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 2, ONE_ETH);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 3, ONE_ETH);
  });

  it("Delist token", async function () {
    const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 1, ONE_ETH);
    await beanieMarket.connect(addrs[0]).delistToken(dummyNFT.address, 1);
  });

  it("Fulfill listing", async function () {
    const { beanieMarket, dummyNFT, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
    await dummyNFT.connect(addrs[0]).setApprovalForAll(beanieMarket.address, true);
    await beanieMarket.connect(addrs[0]).listToken(dummyNFT.address, 1, ONE_ETH);

    await beanieMarket.connect(owner).setCollectionTrading(dummyNFT.address, true);

    await beanieMarket.connect(addrs[1]).fulfillListing(dummyNFT.address, 1, {value: ONE_ETH});
  });
});
