const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

const EMPTY_TRADE = [BIG_ZERO, BIG_ZERO, BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO, [0, false, false]];

function bigNum(num) {
  return ethers.BigNumber.from(num);
}

describe("Sell orders", function () {
  async function deployMarketAndNFTFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const paymentToken = await ERC20.deploy();
    await paymentToken.deployed();

    for (let i = 0; i < 5; i++) {
      paymentToken.mint(addrs[i].address, ONE_ETH.mul(100));
    }

    const MARKET = await ethers.getContractFactory("FungibleMarket");
    const fungibleMarket = await MARKET.deploy(paymentToken.address);
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

    return { fungibleMarket, token1155, paymentToken, owner, admin, addrs, now };
  }

  async function deployMarketAndMakeSellOrderFixture() {
    const [owner, ...addrs] = await ethers.getSigners();
    const admin = addrs[9];

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    const paymentToken = await ERC20.deploy();
    await paymentToken.deployed();

    for (let i = 0; i < 5; i++) {
      paymentToken.mint(addrs[i].address, ONE_ETH.mul(100));
    }

    const MARKET = await ethers.getContractFactory("FungibleMarket");
    const fungibleMarket = await MARKET.deploy(paymentToken.address);
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
      tradeType: 1,
      allowPartialFills: true,
      isEscrowed: false
    }
    const sell1 = await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 1, 1, ONE_ETH, now + 100, tradeFlags);
    const sell2 = await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 1, 2, ONE_ETH, now + 1000, tradeFlags);
    const sell3 = await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 2, 3, ONE_ETH, now + 1000, tradeFlags);
    const sell4 = await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 2, 4, ONE_ETH, now + 1000, tradeFlags);
    const sell5 = await fungibleMarket.connect(addrs[1]).openTrade(token1155.address, 1, 5, ONE_ETH, now + 10000, tradeFlags);

    const promises = [sell1, sell2, sell3, sell4, sell5].map(async (order) =>
      order.wait()
    )
    const orderData = await Promise.all(promises);
    const orderHashes = orderData.map(data => data.logs[0].topics[1]);

    return { fungibleMarket, token1155, paymentToken, owner, addrs, now, orderHashes };
  }

  describe("Deployment", function () {
    it("Deployment", async function () {
      const { fungibleMarket, token1155, paymentToken, owner, addrs } = await loadFixture(deployMarketAndNFTFixture);
      expect(await fungibleMarket.TOKEN()).to.equal(paymentToken.address);
      expect(await token1155.balanceOf(addrs[0].address, 1)).to.eql(ethers.BigNumber.from(10));
      expect(await token1155.balanceOf(addrs[0].address, 11)).to.eql(ethers.BigNumber.from(0));
    });
  })

  describe("Make sell orders", function () {
    it("Make sell order and updated storage structures", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
      const address0 = addrs[0];
      const address1 = addrs[1];

      await token1155.connect(address0).setApprovalForAll(fungibleMarket.address, true);
      await token1155.connect(address1).setApprovalForAll(fungibleMarket.address, true);

      const tradeFlags = {
        tradeType: 1,
        allowPartialFills: true,
        isEscrowed: false
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      let openTradeTx = await fungibleMarket.connect(address0).openTrade(
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
          address0.address,
          [
            1,
            true,
            false,
          ]
        ]
      )
    });
  });

  describe("Make sell order errors", function () {
    it("Cannot make sell order if you don't own enough token", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);
      await token1155.connect(addrs[1]).setApprovalForAll(fungibleMarket.address, true);

      const tradeFlags = {
        tradeType: 1,
        allowPartialFills: true,
        isEscrowed: false
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      await expect(fungibleMarket.connect(addrs[0]).openTrade(
        token1155.address,
        1,
        11,
        ONE_ETH,
        now + 10,
        tradeFlags
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_SellAssetBalanceLow");

      await expect(fungibleMarket.connect(addrs[0]).openTrade(
        token1155.address,
        3,
        1,
        ONE_ETH,
        now + 10,
        tradeFlags
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_SellAssetBalanceLow");

      await expect(fungibleMarket.connect(addrs[2]).openTrade(
        token1155.address,
        1,
        1,
        ONE_ETH,
        now + 10,
        tradeFlags
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_SellAssetBalanceLow");
    });

    it("Cannot make sell order if contract not approved", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      const tradeFlags = {
        tradeType: 1,
        allowPartialFills: true,
        isEscrowed: false
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      await expect(fungibleMarket.connect(addrs[0]).openTrade(
        token1155.address,
        1,
        1,
        ONE_ETH,
        now + 10,
        tradeFlags
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_ContractNotApproved");
    });

    it("Cannot make sell order with escrow flag", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);

      await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, true);

      const tradeFlags = {
        tradeType: 1,
        allowPartialFills: true,
        isEscrowed: true
      }
      // Check the storage structures of several listings. We do this for two different lister addresses to test.
      // TODO: maybe add a second contract address.
      await expect(fungibleMarket.connect(addrs[0]).openTrade(
        token1155.address,
        1,
        1,
        ONE_ETH,
        now + 10,
        tradeFlags
      ))
      .to.be.revertedWithCustomError(fungibleMarket, "BEAN_NoEscrowedSell");
    });
  });

  describe("fulfill sell order, partial fills enabled", function () {
    it("Fulfill sell order ownership change", async function () {
      const { fungibleMarket, token1155, owner, addrs, now, orderHashes } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      expect(await token1155.balanceOf(addrs[0].address, 1)).to.equal(10);
      expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(0);
      const sellOrderToFulfill = orderHashes[0];
      await fungibleMarket.connect(addrs[5]).acceptTrade(sellOrderToFulfill, 1, { value: ONE_ETH });

      expect(await token1155.balanceOf(addrs[0].address, 1)).to.equal(9);
      expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(1);
    });

    it("Fulfill sell order updates storage structures", async function () {
      const { fungibleMarket, token1155, owner, addrs, now, orderHashes } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderToFulfill = orderHashes[0];

      let sellOrderByUser0 = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      let sellOrderByUser1 = await fungibleMarket.getSellOrdersByUser(addrs[1].address);
      expect(sellOrderByUser0).to.contain(sellOrderToFulfill)
      expect(sellOrderByUser1).to.not.contain(sellOrderToFulfill)

      const listingTailUser = await sellOrderByUser0[sellOrderByUser0.length - 1];

      //Fulfill sell order
      await fungibleMarket.connect(addrs[5]).acceptTrade(sellOrderToFulfill, 1, { value: ONE_ETH });
      expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(1);

      sellOrderByUser0 = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      sellOrderByUser1 = await fungibleMarket.getSellOrdersByUser(addrs[1].address);

      expect(sellOrderByUser0.length).to.equal(3)
      expect(sellOrderByUser1.length).to.equal(1)

      //Make sure listing ID is removed from listingsByLister
      expect(sellOrderByUser0).to.not.contain(sellOrderToFulfill)
      expect(sellOrderByUser1).to.not.contain(sellOrderToFulfill)

      //Make sure old listing entry has been removed
      expect(await fungibleMarket.trades(sellOrderToFulfill)).to.eql(EMPTY_TRADE);
    });

    it("Fully fulfill sell order updates storage structures (single-length listing array)", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);
      const address0 = addrs[0];

      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(10);
      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[1].address);
      const sellOrderToFulfill = sellOrderIds[0];

      await fungibleMarket.connect(addrs[5]).acceptTrade(sellOrderToFulfill, 5, { value: ONE_ETH.mul(5) });
      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(5);
      expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(5);
      expect(await fungibleMarket.trades(sellOrderToFulfill)).to.eql(EMPTY_TRADE);
    });

    it("Partially fulfill sell order updates storage structures (single-length listing array)", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);
      const address0 = addrs[0];

      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(10);
      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[1].address);
      const sellOrderToFulfill = sellOrderIds[0];
      const sellOrderData = await fungibleMarket.trades(sellOrderToFulfill);
      const newSellOrderData = [
        sellOrderData.tokenId,
        bigNum(sellOrderData.quantity - 2),
        sellOrderData.price,
        sellOrderData.expiry,
        sellOrderData.posInUserRegister,
        sellOrderData.ca,
        sellOrderData.maker,
        sellOrderData.tradeFlags
      ]

      await fungibleMarket.connect(addrs[5]).acceptTrade(sellOrderToFulfill, 2, { value: ONE_ETH.mul(2) });
      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(8);
      expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(2);
      expect(await fungibleMarket.trades(sellOrderToFulfill)).to.eql(newSellOrderData);
    });

    //TODO: test partial fulfill and then fulfill from original total quantity
    it("Partially fulfill and then fulfill the remainder updates storage structures (single-length listing array)", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);
      const address0 = addrs[0];

      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(10);
      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[1].address);
      const sellOrderToFulfill = sellOrderIds[0];

      await fungibleMarket.connect(addrs[5]).acceptTrade(sellOrderToFulfill, 2, { value: ONE_ETH.mul(2) });
      await fungibleMarket.connect(addrs[5]).acceptTrade(sellOrderToFulfill, 3, { value: ONE_ETH.mul(3) });
      expect(await token1155.balanceOf(addrs[1].address, 1)).to.equal(5);
      expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(5);
      expect(await fungibleMarket.trades(sellOrderToFulfill)).to.eql(EMPTY_TRADE);
    });

    it("Fully fulfill sell order feesOff sends correct eth amount", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[1];

      await fungibleMarket.connect(owner).setFeesOn(false);

      let oldOwnerBalanceBefore = await addrs[0].getBalance();
      let newOwnerBalanceBefore = await addrs[1].getBalance();

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(sellOrderToFulfill, 2, { value: ONE_ETH.mul(2) }))
        .to.changeEtherBalances(
          [addrs[1].address, addrs[0].address],
          [ONE_ETH.mul(2).mul(-1), ONE_ETH.mul(2)]
        );
    });

    it("Fulfill sell order feesOn sends correct eth amount, autosend on", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);
      await fungibleMarket.connect(owner).setAutoSendFees(true);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[1];

      const devFee = await fungibleMarket.devFee();
      const beanieHolderFee = await fungibleMarket.beanieHolderFee();
      const beanBuybackFee = await fungibleMarket.beanBuybackFee();
      const collectionOwnerFee = await fungibleMarket.getCollectionFee(token1155.address);
      const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

      const devAddress = await fungibleMarket.devAddress();
      const beanHolderAddress = await fungibleMarket.beanieHolderAddress();
      const beanBuybackAddress = await fungibleMarket.beanBuybackAddress();
      const collectionOwnerAddress = await fungibleMarket.getCollectionOwner(token1155.address);

      // let oldOwnerBalanceBefore = await addrs[0].getBalance();
      // let newOwnerBalanceBefore = await addrs[1].getBalance();
      // let collectionOwnerBalBefore = await addrs[5].getBalance();

      let devFeeAmount = ONE_ETH.mul(2).mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(2).mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(2).mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = ONE_ETH.mul(2).mul(collectionOwnerFee).div(10000);
      let afterFeePrice = ONE_ETH.mul(2).mul(totalFee).div(10000);

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(sellOrderToFulfill, 2, { value: ONE_ETH.mul(2) }))
        .to.changeEtherBalances(
          [addrs[0].address, addrs[1].address, devAddress, beanHolderAddress, beanBuybackAddress, collectionOwnerAddress],
          [ONE_ETH.mul(2).sub(afterFeePrice), ONE_ETH.mul(-2), devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount, collectionOwnerFeeAmount]
        );
    });

    it("Fulfill sell order feesOn sends correct token amount, autosend off and then process", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      expect(await fungibleMarket.accruedAdminFeesEth()).to.eql(bigNum(0));

      await fungibleMarket.connect(owner).setAutoSendFees(false);
      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[1];

      //Get fee percentages
      const devFee = await fungibleMarket.devFee();
      const beanieHolderFee = await fungibleMarket.beanieHolderFee();
      const beanBuybackFee = await fungibleMarket.beanBuybackFee();
      const collectionOwnerFee = await fungibleMarket.getCollectionFee(token1155.address);
      const accruedAdminFees = devFee.add(beanieHolderFee).add(beanBuybackFee);
      const totalFee = accruedAdminFees.add(collectionOwnerFee);

      const devAddress = await fungibleMarket.devAddress();
      const beanHolderAddress = await fungibleMarket.beanieHolderAddress();
      const beanBuybackAddress = await fungibleMarket.beanBuybackAddress();
      const collectionOwnerAddress = await fungibleMarket.getCollectionOwner(token1155.address);

      let devFeeAmount = ONE_ETH.mul(2).mul(devFee).div(10000);
      let beanieHolderFeeAmount = ONE_ETH.mul(2).mul(beanieHolderFee).div(10000);
      let beanBuybackFeeAmount = ONE_ETH.mul(2).mul(beanBuybackFee).div(10000);
      let collectionOwnerFeeAmount = ONE_ETH.mul(2).mul(collectionOwnerFee).div(10000);
      let afterFeePrice = ONE_ETH.mul(2).mul(totalFee).div(10000);

      await expect(fungibleMarket.connect(addrs[1]).acceptTrade(sellOrderToFulfill, 2, { value: ONE_ETH.mul(2) }))
        .to.changeEtherBalances(
          [addrs[0].address, addrs[1].address, devAddress, beanHolderAddress, beanBuybackAddress, collectionOwnerAddress, fungibleMarket.address],
          [ONE_ETH.mul(2).sub(afterFeePrice), ONE_ETH.mul(-2), 0, 0, 0, collectionOwnerFeeAmount, ONE_ETH.mul(2).mul(accruedAdminFees).div(10000)]
        );

      expect(await fungibleMarket.accruedAdminFeesEth()).to.eql(ONE_ETH.mul(2).mul(accruedAdminFees).div(10000));

      await expect(fungibleMarket.connect(owner).processDevFeesEth())
        .to.changeEtherBalances(
          [addrs[0].address, addrs[1].address, devAddress, beanHolderAddress, beanBuybackAddress, collectionOwnerAddress, fungibleMarket.address],
          [0, 0, devFeeAmount, beanieHolderFeeAmount, beanBuybackFeeAmount, 0, ONE_ETH.mul(2).mul(accruedAdminFees).div(10000).mul(-1)]
        );

    });

    it("Cancel sell order", async function () {
      const { fungibleMarket, token1155, owner, addrs } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      let sellOrderIds0 = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      let sellOrderIds1 = await fungibleMarket.getSellOrdersByUser(addrs[1].address);
      expect(sellOrderIds0.length).to.equal(4)
      expect(sellOrderIds1.length).to.equal(1)
      const sellOrderToDelist = sellOrderIds0[0];

      await fungibleMarket.connect(addrs[0]).cancelTrade(sellOrderToDelist);

      sellOrderIds0 = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      sellOrderIds1 = await fungibleMarket.getSellOrdersByUser(addrs[1].address);
      expect(sellOrderIds0).to.not.contain(sellOrderToDelist)
      expect(sellOrderIds1).to.not.contain(sellOrderToDelist)

      expect(sellOrderIds0.length).to.equal(3)
      expect(sellOrderIds1.length).to.equal(1)

      //Check to see if new listingsByLister and listingsByContract is correct
      expect(await fungibleMarket.trades(sellOrderToDelist)).to.eql(EMPTY_TRADE);
    });

    it("Can fulfill sell order full order and partial orders disabled", async function () {
      const [owner, ...addrs] = await ethers.getSigners();
      const admin = addrs[9];
  
      const ERC20 = await ethers.getContractFactory("ERC20Mock");
      const paymentToken = await ERC20.deploy();
      await paymentToken.deployed();
  
      for (let i = 0; i < 5; i++) {
        paymentToken.mint(addrs[i].address, ONE_ETH.mul(100));
      }
  
      const MARKET = await ethers.getContractFactory("FungibleMarket");
      const fungibleMarket = await MARKET.deploy(paymentToken.address);
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
        tradeType: 1,
        allowPartialFills: false,
        isEscrowed: false
      }
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 1, 1, ONE_ETH, now + 100, tradeFlags);
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 1, 2, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 2, 3, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 2, 4, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[1]).openTrade(token1155.address, 1, 5, ONE_ETH, now + 10000, tradeFlags);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[1];
      const listingData = await fungibleMarket.trades(sellOrderToFulfill);

      await fungibleMarket.connect(addrs[5]).acceptTrade(
        sellOrderToFulfill, 2, { value: listingData.price.mul(2) })
    });
  });

  describe("Fulfill sell order token errors", function () {
    it("Cannot fulfill sell order for an unlisted token", async function () {
      const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);
      await expect(fungibleMarket.connect(addrs[5]).acceptTrade(ethers.utils.hexZeroPad(0x2, 32), addrs[5].address)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_CollectionNotEnabled");
    });

    it("Cannot fulfill sell order by sending too little ETH", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[0];
      const listingData = await fungibleMarket.trades(sellOrderToFulfill);

      await expect(fungibleMarket.connect(addrs[5]).acceptTrade(
        sellOrderToFulfill, 1, { value: listingData.price.div(2) })
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_SellFulfillUnderfunded");
    });

    it("Cannot fulfill sell order if past expiry", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[0];
      const listingData = await fungibleMarket.trades(sellOrderToFulfill);

      await network.provider.send("evm_setNextBlockTimestamp", [Number(listingData.expiry) + 10])
      await network.provider.send("evm_mine")

      await expect(fungibleMarket.connect(addrs[5]).acceptTrade(
        sellOrderToFulfill, 1, { value: listingData.price })
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_OrderExpired");
    });

    it("Cannot fulfill sell order if owner no longer owns enough tokens", async function () {
      const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[0];
      const listingData = await fungibleMarket.trades(sellOrderToFulfill);

      await token1155.connect(addrs[0]).safeTransferFrom(addrs[0].address, addrs[1].address, bigNum(1), bigNum(10), []);

      await expect(fungibleMarket.connect(addrs[5]).acceptTrade(
        sellOrderToFulfill, 1, { value: listingData.price })
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotEnoughTokensToFulfull");
    });

    it("Cannot fulfill sell order if not taking full order and partial orders disabled", async function () {
      const [owner, ...addrs] = await ethers.getSigners();
      const admin = addrs[9];
  
      const ERC20 = await ethers.getContractFactory("ERC20Mock");
      const paymentToken = await ERC20.deploy();
      await paymentToken.deployed();
  
      for (let i = 0; i < 5; i++) {
        paymentToken.mint(addrs[i].address, ONE_ETH.mul(100));
      }
  
      const MARKET = await ethers.getContractFactory("FungibleMarket");
      const fungibleMarket = await MARKET.deploy(paymentToken.address);
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
        tradeType: 1,
        allowPartialFills: false,
        isEscrowed: false
      }
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 1, 1, ONE_ETH, now + 100, tradeFlags);
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 1, 2, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 2, 3, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[0]).openTrade(token1155.address, 2, 4, ONE_ETH, now + 1000, tradeFlags);
      await fungibleMarket.connect(addrs[1]).openTrade(token1155.address, 1, 5, ONE_ETH, now + 10000, tradeFlags);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToFulfill = sellOrderIds[1];
      const listingData = await fungibleMarket.trades(sellOrderToFulfill);

      await expect(fungibleMarket.connect(addrs[5]).acceptTrade(
        sellOrderToFulfill, 1, { value: listingData.price })
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_TradeNotParitalFill");

    });
  })

  describe("Cancel trade errors and delist cases", function () { // works, fixtures just break -- hh problem
    it("Cannot cancel trade if not maker", async function () {
      const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToCancel = sellOrderIds[0];

      await expect(fungibleMarket.connect(addrs[5]).cancelTrade(sellOrderToCancel)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotAuthorized");
    });

    it("Can cancel trade if caller is aonlydmin", async function () {
      const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToCancel = sellOrderIds[0];

      await fungibleMarket.connect(owner).cancelTrade(sellOrderToCancel);
    });

    it("Anyone can cancel trade if expiry has passed.", async function () {
      const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndMakeSellOrderFixture);

      const sellOrderIds = await fungibleMarket.getSellOrdersByUser(addrs[0].address);
      const sellOrderToCancel = sellOrderIds[0];
      const sellOrderData = await fungibleMarket.trades(sellOrderToCancel)

      await expect(fungibleMarket.connect(addrs[2]).cancelTrade(sellOrderToCancel)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotAuthorized");

      await network.provider.send("evm_setNextBlockTimestamp", [Number(sellOrderData.expiry) - 10])
      await network.provider.send("evm_mine")

      await expect(fungibleMarket.connect(addrs[2]).cancelTrade(sellOrderToCancel)
      ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotAuthorized");

      await network.provider.send("evm_setNextBlockTimestamp", [Number(sellOrderData.expiry) + 10])
      await network.provider.send("evm_mine")

      await fungibleMarket.connect(addrs[2]).cancelTrade(sellOrderToCancel);
    });
  });
});