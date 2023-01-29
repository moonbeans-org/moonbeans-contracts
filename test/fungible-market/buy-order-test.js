const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const MAX_UINT = ethers.constants.MaxUint256;
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

const EMPTY_TRADE = [BIG_ZERO, BIG_ZERO, BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, [0, false, false]];

function bigNum(num) {
  return ethers.BigNumber.from(num);
}

describe("Buy orders (1155)", function () {
  async function deployMarketAndNFTFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.deployed();

    for (let i = 0; i<10; i++) {
      await weth.connect(addrs[i]).deposit({value: ONE_ETH.mul(50)});
    }

    const FeeProcessor = await ethers.getContractFactory("BeanFeeProcessor");
    const feeProcessor = await FeeProcessor.deploy(weth.address);
    await feeProcessor.deployed();

    const MARKET = await ethers.getContractFactory("FungibleBeanieMarketV1");
    const fungibleMarket = await MARKET.deploy(weth.address, feeProcessor.address);
    await fungibleMarket.deployed();

    const TOKEN1155 = await ethers.getContractFactory("ERC1155Mock");
    const token1155 = await TOKEN1155.deploy();
    await token1155.deployed();

    await token1155.connect(addrs[0]).mint(addrs[0].address, 1, 10);
    await token1155.connect(addrs[1]).mint(addrs[1].address, 1, 10);
    await token1155.connect(addrs[0]).mint(addrs[0].address, 2, 10);
    await token1155.connect(addrs[1]).mint(addrs[1].address, 2, 10);

    await fungibleMarket.connect(owner).setCollectionTrading(token1155.address, true);
    await fungibleMarket.connect(owner).setCollectionOwner(token1155.address, addrs[5].address);;
    await fungibleMarket.connect(owner).setCollectionOwnerFee(token1155.address, 100); //1% fee

    const block = await ethers.provider.getBlock();
    const now = block['timestamp']

    return { fungibleMarket, token1155, weth, owner, admin, addrs, now };
  }

  async function deployMarketAndMakeBuyOrderFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.deployed();

    for (let i = 0; i<10; i++) {
      await weth.connect(addrs[i]).deposit({value: ONE_ETH.mul(50)});
    }

    const FeeProcessor = await ethers.getContractFactory("BeanFeeProcessor");
    const feeProcessor = await FeeProcessor.deploy(weth.address);
    await feeProcessor.deployed();

    const MARKET = await ethers.getContractFactory("FungibleBeanieMarketV1");
    const fungibleMarket = await MARKET.deploy(weth.address, feeProcessor.address);
    await fungibleMarket.deployed();

    const TOKEN1155 = await ethers.getContractFactory("ERC1155Mock");
    const token1155 = await TOKEN1155.deploy();
    await token1155.deployed();

    await token1155.connect(addrs[0]).mint(addrs[0].address, 1, 10);
    await token1155.connect(addrs[1]).mint(addrs[1].address, 1, 10);
    await token1155.connect(addrs[0]).mint(addrs[0].address, 2, 10);
    await token1155.connect(addrs[1]).mint(addrs[1].address, 2, 10);

    await fungibleMarket.connect(owner).setCollectionTrading(token1155.address, true);
    await fungibleMarket.connect(owner).setCollectionOwner(token1155.address, addrs[5].address);;
    await fungibleMarket.connect(owner).setCollectionOwnerFee(token1155.address, 100); //1% fee

    const block = await ethers.provider.getBlock();
    const now = block['timestamp']

    const tradeFlags = {
      tradeType: 0,
      allowPartialFills: true,
      isEscrowed: false
    }

    await weth.connect(addrs[2]).approve(fungibleMarket.address, MAX_UINT);
    await weth.connect(addrs[3]).approve(fungibleMarket.address, MAX_UINT);

    const sell1 = await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 1, 1, ONE_ETH, now + 100, tradeFlags);
    const sell2 = await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 1, 2, ONE_ETH, now + 1000, tradeFlags);
    const sell3 = await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 2, 3, ONE_ETH, now + 1000, tradeFlags);
    const sell4 = await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 2, 4, ONE_ETH, now + 1000, tradeFlags);
    const sell5 = await fungibleMarket.connect(addrs[3]).openTrade(token1155.address, 1, 5, ONE_ETH, now + 10000, tradeFlags);

    const promises = [sell1, sell2, sell3, sell4, sell5].map(async (order) =>
      order.wait()
    )
    const orderData = await Promise.all(promises);
    const orderHashes = orderData.map(data => data.logs[0].topics[1]);

    return { fungibleMarket, feeProcessor, token1155, weth, owner, addrs, now, orderHashes };
  }

  describe("Deployment", function () {
    it("Deployment", async function () {
      const { fungibleMarket, token1155, weth, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      expect(await fungibleMarket.TOKEN()).to.equal(weth.address);
      expect(await token1155.balanceOf(addrs[0].address, 1)).to.eql(ethers.BigNumber.from(10));
      expect(await token1155.balanceOf(addrs[0].address, 11)).to.eql(ethers.BigNumber.from(0));
    });
  })

  describe("Make buy orders", function () {
    it("Make buy order and updat storage structures", async function () {
      const { fungibleMarket, token1155, owner, addrs, now, weth } = await loadFixture(deployMarketAndNFTFixture);

      await weth.connect(addrs[2]).approve(fungibleMarket.address, MAX_UINT);

      const tradeFlags = {
        tradeType: 0,
        allowPartialFills: true,
        isEscrowed: false
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      let openTradeTx = await fungibleMarket.connect(addrs[2]).openTrade(
        token1155.address,
        1,
        1,
        ONE_ETH,
        now + 10,
        tradeFlags
      );
      let receipt = await openTradeTx.wait();
      let orderHash = receipt.logs[0].topics[1];
      let orderData = await fungibleMarket.trades(orderHash);
      // UGLY BUT TRUE
      expect(orderData).to.eql(
        [
          bigNum(1),
          bigNum(1),
          ONE_ETH,
          bigNum(now + 10),
          bigNum(0),
          token1155.address,
          addrs[2].address,
          [
            0,
            true,
            false,
          ]
        ]
      )
    });
  });

  describe("Make buy order errors", function () {
    it("Cannot make buy order via escrow if you don't send enough eth", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      const tradeFlags = {
        tradeType: 0,
        allowPartialFills: true,
        isEscrowed: true
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      await expect(fungibleMarket.connect(addrs[2]).openTrade(
        token1155.address,
        1,
        5,
        ONE_ETH.mul(5),
        now + 10,
        tradeFlags,
        {value: ONE_ETH}
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_EscrowCurrencyUnderfunded");

    });

    it("Cannot make buy order if not escrow contract not approved to handle payment token", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      const tradeFlags = {
        tradeType: 0,
        allowPartialFills: true,
        isEscrowed: false
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      await expect(fungibleMarket.connect(addrs[2]).openTrade(
        token1155.address,
        1,
        1,
        ONE_ETH,
        now + 10,
        tradeFlags
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_PaymentTokenNotApproved");
    });

    it("Cannot make buy order without any payment tokens", async function () {
      const { fungibleMarket, token1155, owner, addrs, now, weth } = await loadFixture(deployMarketAndNFTFixture);

      await weth.connect(addrs[10]).approve(fungibleMarket.address, MAX_UINT);
      
      const tradeFlags = {
        tradeType: 0,
        allowPartialFills: true,
        isEscrowed: false
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      await expect(fungibleMarket.connect(addrs[10]).openTrade(
        token1155.address,
        1,
        1,
        ONE_ETH,
        now + 10,
        tradeFlags
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_BuyerAccountUnderfunded");
    });
  });

  describe("fulfill buy order, partial fills enabled", function () {
    it("Fulfill buy order ownership change", async function () {
      const { fungibleMarket, weth, token1155, owner, addrs, now, orderHashes } = await loadFixture(deployMarketAndMakeBuyOrderFixture);

      expect(await token1155.balanceOf(addrs[0].address, 1)).to.equal(10);
      expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(0);
      const buyOrderToFulfill = orderHashes[0];
      const buyOrderData = await fungibleMarket.trades(buyOrderToFulfill);

      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);

      await fungibleMarket.connect(addrs[0]).acceptTrade(buyOrderToFulfill, 1);

      expect(await token1155.balanceOf(addrs[0].address, 1)).to.equal(9);
      expect(await token1155.balanceOf(addrs[2].address, 1)).to.equal(1);
    });

    it("Fulfill buy order updates storage structures", async function () {
      const { fungibleMarket, token1155, owner, addrs, now, orderHashes } = await loadFixture(deployMarketAndMakeBuyOrderFixture);

      const buyOrderToFulfill = orderHashes[0];

      //Make sure old listing entry has been removed
      expect(await fungibleMarket.trades(buyOrderToFulfill)).to.not.eql(EMPTY_TRADE);

      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);

      let buyOrderByUser0 = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      let buyOrderByUser1 = await fungibleMarket.getBuyOrdersByUser(addrs[3].address);
      expect(buyOrderByUser0).to.contain(buyOrderToFulfill)
      expect(buyOrderByUser1).to.not.contain(buyOrderToFulfill)

      const listingTailUser = await buyOrderByUser0[buyOrderByUser0.length - 1];

      //Fulfill buy order
      await fungibleMarket.connect(addrs[0]).acceptTrade(buyOrderToFulfill, 1);
      expect(await token1155.balanceOf(addrs[2].address, 1)).to.equal(1);

      buyOrderByUser0 = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      buyOrderByUser1 = await fungibleMarket.getBuyOrdersByUser(addrs[3].address);

      expect(buyOrderByUser0.length).to.equal(3)
      expect(buyOrderByUser1.length).to.equal(1)

      //Make sure listing ID is removed from listingsByLister
      expect(buyOrderByUser0).to.not.contain(buyOrderToFulfill)
      expect(buyOrderByUser1).to.not.contain(buyOrderToFulfill)

      //Make sure old listing entry has been removed
      expect(await fungibleMarket.trades(buyOrderToFulfill)).to.eql(EMPTY_TRADE);
    });

    it("Fully fulfill buy order updates storage structures (single-length listing array)", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      const address0 = addrs[0];

      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);

      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(10);
      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[0];

      await fungibleMarket.connect(addrs[0]).acceptTrade(buyOrderToFulfill, 1);
      expect(await token1155.balanceOf(addrs[0].address, 1)).to.equal(9);
      expect(await token1155.balanceOf(addrs[2].address, 1)).to.equal(1);
      expect(await fungibleMarket.trades(buyOrderToFulfill)).to.eql(EMPTY_TRADE);
    });

    it("Partially fulfill buy order updates storage structures (single-length listing array)", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);

      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);

      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(10);
      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[3].address);
      const buyOrderToFulfill = buyOrderIds[0];
      const buyOrderData = await fungibleMarket.trades(buyOrderToFulfill);
      const newBuyOrderData = [
        buyOrderData.tokenId,
        bigNum(buyOrderData.quantity - 2),
        buyOrderData.price,
        buyOrderData.expiry,
        buyOrderData.posInUserRegister,
        buyOrderData.ca,
        buyOrderData.maker,
        buyOrderData.tradeFlags
      ]

      await fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderToFulfill, 2);
      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(8);
      expect(await token1155.balanceOf(addrs[3].address, 1)).to.equal(2);
      expect(await fungibleMarket.trades(buyOrderToFulfill)).to.eql(newBuyOrderData);
    });

    //TODO: test partial fulfill and then fulfill from original total quantity
    it("Partially fulfill and then fulfill the remainder updates storage structures (single-length listing array)", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);

      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(10);
      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[3].address);
      const buyOrderToFulfill = buyOrderIds[0];

      await fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderToFulfill, 2);
      await fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderToFulfill, 3);
      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(5);
      expect(await token1155.balanceOf(addrs[3].address, 1)).to.equal(5);
      expect(await fungibleMarket.trades(buyOrderToFulfill)).to.eql(EMPTY_TRADE);
    });

    it("Fully fulfill buy order feesOff sends correct eth amount", async function () {
      const { fungibleMarket, token1155, owner, addrs, weth } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[1];

      await fungibleMarket.connect(owner).setFeesOn(false);

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderToFulfill, 2))
        .to.changeTokenBalances(
          weth,
          [addrs[1].address, addrs[2].address],
          [0, ONE_ETH.mul(-2)]
        );

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderIds[0], 1))
        .to.changeEtherBalances(
          [addrs[1].address, addrs[2].address],
          [ONE_ETH, 0]
        );
    });

    it("Fulfill buy order feesOn sends correct token amount, autosend on", async function () {
      const { fungibleMarket, feeProcessor, token1155, owner, addrs, now, weth } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);
      await feeProcessor.connect(owner).setAutoSendFees(true);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[1];

      const devFee = await feeProcessor.devFee();
      const beanieHolderFee = await feeProcessor.beanieHolderFee();
      const beanBuybackFee = await feeProcessor.beanBuybackFee();
      const collectionOwnerFee = await fungibleMarket.getCollectionFee(token1155.address);
      const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

      const devAddress = await feeProcessor.devAddress();
      const beanHolderAddress = await feeProcessor.beanieHolderAddress();
      const beanBuybackAddress = await feeProcessor.beanBuybackAddress();
      const collectionOwnerAddress = await fungibleMarket.getCollectionOwner(token1155.address);

      let devFeeAmount = ONE_ETH.mul(2).mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(2).mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(2).mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = ONE_ETH.mul(2).mul(collectionOwnerFee).div(10000);
      let afterFeePrice = ONE_ETH.mul(2).mul(totalFee).div(10000);

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderToFulfill, 2))
        .to.changeEtherBalances(
          [addrs[1].address, addrs[2].address, devAddress, beanHolderAddress, beanBuybackAddress, collectionOwnerAddress, feeProcessor.address],
          [ONE_ETH.mul(2).sub(afterFeePrice), 0, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount, collectionOwnerFeeAmount, 0]
        );
      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderIds[0], 1))
        .to.changeTokenBalances(
          weth,
          [addrs[1].address, addrs[2].address, devAddress, beanHolderAddress, beanBuybackAddress, collectionOwnerAddress, feeProcessor.address],
          [0, ONE_ETH.mul(-1), 0, 0, 0, 0, 0]
        );
    });

    it("Fulfill buy order feesOn sends correct token amount, autosend off and then process", async function () {
      const { fungibleMarket, feeProcessor, token1155, owner, addrs, now, weth } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);

      await feeProcessor.connect(owner).setAutoSendFees(false);
      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[1];

      //Get fee percentages
      const devFee = await feeProcessor.devFee();
      const beanieHolderFee = await feeProcessor.beanieHolderFee();
      const beanBuybackFee = await feeProcessor.beanBuybackFee();
      const collectionOwnerFee = await fungibleMarket.getCollectionFee(token1155.address);
      const accruedAdminFees = devFee.add(beanieHolderFee).add(beanBuybackFee);
      const totalFee = accruedAdminFees.add(collectionOwnerFee);

      const devAddress = await feeProcessor.devAddress();
      const beanHolderAddress = await feeProcessor.beanieHolderAddress();
      const beanBuybackAddress = await feeProcessor.beanBuybackAddress();
      const collectionOwnerAddress = await fungibleMarket.getCollectionOwner(token1155.address);

      let devFeeAmount = ONE_ETH.mul(2).mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(2).mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(2).mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = ONE_ETH.mul(2).mul(collectionOwnerFee).div(10000);
      let afterFeePrice = ONE_ETH.mul(2).mul(totalFee).div(10000);

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(buyOrderToFulfill, 2))
        .to.changeEtherBalances(
          [addrs[1].address, addrs[2].address, devAddress, beanHolderAddress, beanBuybackAddress, collectionOwnerAddress, feeProcessor.address],
          [ONE_ETH.mul(2).sub(afterFeePrice), 0, 0, 0, 0, collectionOwnerFeeAmount, ONE_ETH.mul(2).mul(accruedAdminFees).div(10000)]
        );

      await expect(feeProcessor.connect(owner).processDevFeesEth())
        .to.changeEtherBalances(
          [addrs[1].address, addrs[2].address, devAddress, beanHolderAddress, beanBuybackAddress, collectionOwnerAddress, feeProcessor.address],
          [0, 0, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount, 0, ONE_ETH.mul(2).mul(accruedAdminFees).div(10000).mul(-1)]
        );

    });

    it("Cancel buy order", async function () {
      const { fungibleMarket, token1155, owner, addrs } = await loadFixture(deployMarketAndMakeBuyOrderFixture);

      let buyOrderIds0 = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      let buyOrderIds1 = await fungibleMarket.getBuyOrdersByUser(addrs[3].address);
      expect(buyOrderIds0.length).to.equal(4)
      expect(buyOrderIds1.length).to.equal(1)
      const buyOrderToDelist = buyOrderIds0[0];

      await fungibleMarket.connect(addrs[2]).cancelTrade(buyOrderToDelist);

      buyOrderIds0 = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      buyOrderIds1 = await fungibleMarket.getBuyOrdersByUser(addrs[3].address);
      expect(buyOrderIds0).to.not.contain(buyOrderToDelist)
      expect(buyOrderIds1).to.not.contain(buyOrderToDelist)

      expect(buyOrderIds0.length).to.equal(3)
      expect(buyOrderIds1.length).to.equal(1)

      //Check to see if new listingsByLister and listingsByContract is correct
      expect(await fungibleMarket.trades(buyOrderToDelist)).to.eql(EMPTY_TRADE);
    });

    it("Can fulfill buy order full order and partial orders disabled", async function () {
      const [owner, ...addrs] = await ethers.getSigners();
  
      const WETH = await ethers.getContractFactory("WETH9");
      const weth = await WETH.deploy();
      await weth.deployed();
  
      for (let i = 0; i<10; i++) {
        await weth.connect(addrs[i]).deposit({value: ONE_ETH.mul(50)});
      }
  
      const FeeProcessor = await ethers.getContractFactory("BeanFeeProcessor");
      const feeProcessor = await FeeProcessor.deploy(weth.address);
      await feeProcessor.deployed();
  
      const MARKET = await ethers.getContractFactory("FungibleBeanieMarketV1");
      const fungibleMarket = await MARKET.deploy(weth.address, feeProcessor.address);
      await fungibleMarket.deployed();
  
      const TOKEN1155 = await ethers.getContractFactory("ERC1155Mock");
      const token1155 = await TOKEN1155.deploy();
      await token1155.deployed();
  
      await token1155.connect(addrs[0]).mint(addrs[0].address, 1, 10);
      await token1155.connect(addrs[1]).mint(addrs[1].address, 1, 10);
      await token1155.connect(addrs[0]).mint(addrs[0].address, 2, 10);
      await token1155.connect(addrs[1]).mint(addrs[1].address, 2, 10);
  
      await fungibleMarket.connect(owner).setCollectionTrading(token1155.address, true);
      await fungibleMarket.connect(owner).setCollectionOwner(token1155.address, addrs[5].address);;
      await fungibleMarket.connect(owner).setCollectionOwnerFee(token1155.address, 100); //1% fee
  
      const block = await ethers.provider.getBlock();
      const now = block['timestamp']
  
      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);
  
      const tradeFlags = {
        tradeType: 0,
        allowPartialFills: false,
        isEscrowed: false
      }

      await weth.connect(addrs[2]).approve(fungibleMarket.address, MAX_UINT);
      await weth.connect(addrs[3]).approve(fungibleMarket.address, MAX_UINT);

      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 1, 1, ONE_ETH, now + 100, tradeFlags);
      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 1, 2, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 2, 3, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 2, 4, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[3]).openTrade(token1155.address, 1, 5, ONE_ETH, now + 10000, tradeFlags);

      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[1];
      const listingData = await fungibleMarket.trades(buyOrderToFulfill);

      await fungibleMarket.connect(addrs[0]).acceptTrade(
        buyOrderToFulfill, 2)
    });
  });

  describe("Fulfill buy order token errors", function () {
    it("Cannot fulfill buy order for an unlisted token", async function () {
      const { fungibleMarket, token1155, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await expect(fungibleMarket.connect(addrs[5]).acceptTrade(ethers.utils.hexZeroPad(0x2, 32), addrs[5].address)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_CollectionNotEnabled");
    });

    it("Cannot fulfill buy order if maker owns too little tokens", async function () {
      const { fungibleMarket, token1155, owner, addrs, now, weth } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await weth.connect(addrs[2]).approve(fungibleMarket.address, MAX_UINT);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);

      const takerwethBal = await weth.balanceOf(addrs[2].address);
      await weth.connect(addrs[2]).transfer(addrs[10].address, takerwethBal.sub(1));

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[0];

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(
        buyOrderToFulfill, 1)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotEnoughMakerFunds");
    });

    it("Cannot fulfill buy order if past expiry", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[0];
      const listingData = await fungibleMarket.trades(buyOrderToFulfill);

      await network.provider.send("evm_setNextBlockTimestamp", [Number(listingData.expiry) + 10])
      await network.provider.send("evm_mine")

      await expect(fungibleMarket.connect(addrs[0]).acceptTrade(
        buyOrderToFulfill, 1)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_OrderExpired");
    });

    it("Cannot fulfill buy order if owner no longer owns enough tokens", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);
      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToFulfill = buyOrderIds[0];

      await token1155.connect(addrs[0]).safeTransferFrom(addrs[0].address, addrs[1].address, bigNum(1), bigNum(10), []);

      await expect(fungibleMarket.connect(addrs[0]).acceptTrade(
        buyOrderToFulfill, 1)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotEnoughTokensToFulfull");
    });

    it("Cannot fulfill buy order if not taking full order and partial orders disabled", async function () {
      const [owner, ...addrs] = await ethers.getSigners();
      const admin = addrs[9];
  
      const WETH = await ethers.getContractFactory("WETH9");
      const weth = await WETH.deploy();
      await weth.deployed();
  
      for (let i = 0; i<10; i++) {
        await weth.connect(addrs[i]).deposit({value: ONE_ETH.mul(50)});
      }
  
      const FeeProcessor = await ethers.getContractFactory("BeanFeeProcessor");
      const feeProcessor = await FeeProcessor.deploy(weth.address);
      await feeProcessor.deployed();
  
      const MARKET = await ethers.getContractFactory("FungibleBeanieMarketV1");
      const fungibleMarket = await MARKET.deploy(weth.address, feeProcessor.address);
      await fungibleMarket.deployed();
  
      const TOKEN1155 = await ethers.getContractFactory("ERC1155Mock");
      const token1155 = await TOKEN1155.deploy();
      await token1155.deployed();
  
      await token1155.connect(addrs[0]).mint(addrs[0].address, 1, 10);
      await token1155.connect(addrs[1]).mint(addrs[1].address, 1, 10);
      await token1155.connect(addrs[0]).mint(addrs[0].address, 2, 10);
      await token1155.connect(addrs[1]).mint(addrs[1].address, 2, 10);
  
      await fungibleMarket.connect(owner).setCollectionTrading(token1155.address, true);
      await fungibleMarket.connect(owner).setCollectionOwner(token1155.address, addrs[5].address);;
      await fungibleMarket.connect(owner).setCollectionOwnerFee(token1155.address, 100); //1% fee
  
      const block = await ethers.provider.getBlock();
      const now = block['timestamp']
  
      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);
  
      const tradeFlags = {
        tradeType: 0,
        allowPartialFills: false,
        isEscrowed: false
      }

      await weth.connect(addrs[2]).approve(fungibleMarket.address, MAX_UINT);
      await weth.connect(addrs[3]).approve(fungibleMarket.address, MAX_UINT);

      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 1, 1, ONE_ETH, now + 100, tradeFlags);
      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 1, 2, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 2, 3, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[2]).openTrade(token1155.address, 2, 4, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[3]).openTrade(token1155.address, 1, 5, ONE_ETH, now + 10000, tradeFlags);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);

      const buyOrderToFulfill = buyOrderIds[1];
      const listingData = await fungibleMarket.trades(buyOrderToFulfill);

      await expect(fungibleMarket.connect(addrs[0]).acceptTrade(
        buyOrderToFulfill, 1)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_TradeNotParitalFill");

    });
  })

  describe("Cancel trade errors and delist cases", function () { // works, fixtures just break -- hh problem
    it("Cannot cancel trade if not maker", async function () {
      const { fungibleMarket, token1155, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToCancel = buyOrderIds[0];

      await expect(fungibleMarket.connect(addrs[5]).cancelTrade(buyOrderToCancel)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotAuthorized");
    });

    it("Can cancel trade if caller is admin", async function () {
      const { fungibleMarket, token1155, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToCancel = buyOrderIds[0];

      await fungibleMarket.connect(owner).cancelTrade(buyOrderToCancel);
    });

    it("Anyone can cancel trade if expiry has passed.", async function () {
      const { fungibleMarket, token1155, weth, owner, addrs, now } = await loadFixture(deployMarketAndMakeBuyOrderFixture);

      const buyOrderIds = await fungibleMarket.getBuyOrdersByUser(addrs[2].address);
      const buyOrderToCancel = buyOrderIds[0];
      const buyOrderData = await fungibleMarket.trades(buyOrderToCancel)

      await expect(fungibleMarket.connect(addrs[5]).cancelTrade(buyOrderToCancel)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotAuthorized");

      await network.provider.send("evm_setNextBlockTimestamp", [Number(buyOrderData.expiry) - 10])
      await network.provider.send("evm_mine")

      await expect(fungibleMarket.connect(addrs[5]).cancelTrade(buyOrderToCancel)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotAuthorized");

      await network.provider.send("evm_setNextBlockTimestamp", [Number(buyOrderData.expiry) + 10])
      await network.provider.send("evm_mine")

      await fungibleMarket.connect(addrs[5]).cancelTrade(buyOrderToCancel);
    });
  });
});