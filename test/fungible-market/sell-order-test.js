const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETH = ethers.utils.parseEther("1.0");
const BIG_ZERO = ethers.constants.Zero;
const ADDR_ZERO = ethers.constants.AddressZero;

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

    async function deployMarketAndListNFTsFixture() {
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
        it("List token and updated storage structures", async function () {
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
                    token1155.address,
                    address0.address,
                    [
                        1,
                        true,
                        false,
                    ]
                ]
            )
            console.log(orderData);

            // let listingsByLister = await fungibleMarket.getListingsByLister(address0.address);
            // let listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
            // expect(listingsByLister.length).to.equal(1)
            // expect(listingsByContract.length).to.equal(1)
            // expect(listingsByLister[0]).to.equal(listingsByContract[0]);
            
            // expect(await fungibleMarket.listings(listingsByLister[0])).to.eql(
            //     [
            //         ethers.BigNumber.from(1),
            //         ONE_ETH,
            //         ethers.BigNumber.from(now + 10),
            //         token1155.address,
            //         addrs[0].address
            //     ]
            // )

            // await fungibleMarket.connect(address0).listToken(token1155.address, 2, ONE_ETH, now + 100);
            // listingsByLister = await fungibleMarket.getListingsByLister(address0.address);
            // listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
            // expect(listingsByLister.length).to.equal(2)
            // expect(listingsByContract.length).to.equal(2)
            // expect(listingsByLister[1]).to.equal(listingsByContract[1]);
            // expect(await fungibleMarket.listings(listingsByLister[1])).to.eql(
            //     [
            //         ethers.BigNumber.from(2),
            //         ONE_ETH,
            //         ethers.BigNumber.from(now + 100),
            //         token1155.address,
            //         addrs[0].address
            //     ]
            // )

            // await fungibleMarket.connect(address1).listToken(token1155.address, 11, ONE_ETH, now + 1000);
            // listingsByLister = await fungibleMarket.getListingsByLister(address1.address);
            // listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
            // expect(listingsByLister[0]).to.equal(listingsByContract[2]);
            // expect(listingsByLister.length).to.equal(1)
            // expect(listingsByContract.length).to.equal(3)
            // expect(await fungibleMarket.listings(listingsByLister[0])).to.eql(
            //     [
            //         ethers.BigNumber.from(11),
            //         ONE_ETH,
            //         ethers.BigNumber.from(now + 1000),
            //         token1155.address,
            //         addrs[1].address
            //     ]
            // )

        });
    });

    //   describe("Admin clear listing", function () {
    //     it("Admin can clear listing", async function () {
    //         const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
    //         const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
    //         const listingToClear = listingIds[0];

    //         await fungibleMarket.connect(owner).clearListing(listingToClear);

    //         let listingsByLister0 = await fungibleMarket.getListingsByLister(addrs[0].address);
    //         let listingsByLister1 = await fungibleMarket.getListingsByLister(addrs[1].address);
    //         let listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
    //         expect(listingsByLister0).to.not.contain(listingToClear)
    //         expect(listingsByContract).to.not.contain(listingToClear)
    //         expect(listingsByLister1).to.not.contain(listingToClear)
    //     });

    //     it("Revert clearListing call if caller not admin", async function () {
    //         const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
    //         const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
    //         const listingToClear = listingIds[0];

    //         await expect(fungibleMarket.connect(addrs[0]).clearListing(listingToClear)).to.be.revertedWithCustomError(
    //             fungibleMarket, "BEAN_NotOwnerOrAdmin"
    //         );
    //     });
    //   });

      describe("fulfill sell order", function () {
        it.only("Fulfill sell order ownership change", async function () {
          const { fungibleMarket, token1155, owner, addrs, now, orderHashes } = await loadFixture(deployMarketAndListNFTsFixture);

          expect(await token1155.balanceOf(addrs[0].address, 1)).to.equal(10);
          expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(0);
          const listingToFulfill = orderHashes[0];
          await fungibleMarket.connect(addrs[5]).acceptTrade(listingToFulfill, 1, {value: ONE_ETH});

          expect(await token1155.balanceOf(addrs[0].address, 1)).to.equal(9);
          expect(await token1155.balanceOf(addrs[5].address, 1)).to.equal(1);
        });

        it("Fulfill sell order updates storage structures", async function () {
          const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
          const address0 = addrs[0];

          expect(await token1155.ownerOf(1)).to.equal(addrs[0].address);
          const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
          const listingToFulfill = listingIds[0];

          let listing0 = await fungibleMarket.getListingsByLister(addrs[0].address);
          let listingsByLister1 = await fungibleMarket.getListingsByLister(addrs[1].address);
          let listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
          expect(listingsByLister0).to.contain(listingToFulfill)
          expect(listingsByContract).to.contain(listingToFulfill)
          expect(listingsByLister1).to.not.contain(listingToFulfill)

          const listingTailLister = await listingsByLister0[listingsByLister0.length - 1];
          const listingTailContract = await listingsByContract[listingsByContract.length - 1];

          //Fulfill listing
          await fungibleMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
          expect(await token1155.ownerOf(1)).to.equal(addrs[1].address);

          listingsByLister0 = await fungibleMarket.getListingsByLister(addrs[0].address);
          listingsByLister1 = await fungibleMarket.getListingsByLister(addrs[1].address);
          listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
          expect(listingsByLister0.length).to.equal(3)
          expect(listingsByLister1.length).to.equal(1)
          expect(listingsByContract.length).to.equal(4)

          //Make sure listing ID is removed from listingsByLister
          expect(listingsByLister0).to.not.contain(listingToFulfill)
          expect(listingsByLister1).to.not.contain(listingToFulfill)
          expect(listingsByContract).to.not.contain(listingToFulfill)

          //Check to see if new listingsByLister and listingsByContract is correct
          expect((await fungibleMarket.posInListings(listingTailLister)).posInListingsByLister).to.eql(BIG_ZERO);
          expect((await fungibleMarket.posInListings(listingTailContract)).posInListingsByContract).to.eql(BIG_ZERO);

          //Make sure old listing entry has been removed
          expect(await fungibleMarket.listings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
          expect(await fungibleMarket.posInListings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO]);
        });

        it("Fulfill listing updates storage structures (single-length listing array)", async function () {
          const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
          const address0 = addrs[0];

          expect(await token1155.ownerOf(11)).to.equal(addrs[1].address);
          const listingIds = await fungibleMarket.getListingsByLister(addrs[1].address);
          const listingToFulfill = listingIds[0];

          await fungibleMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[2].address, {value: ONE_ETH});
          expect(await token1155.ownerOf(11)).to.equal(addrs[2].address);
          expect(await fungibleMarket.listings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
          expect(await fungibleMarket.posInListings(listingToFulfill)).to.eql([BIG_ZERO, BIG_ZERO]);
        });

        it("Fulfill listing feesOff sends correct eth amount", async function () {
          const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
          const address0 = addrs[0];

          const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
          const listingToFulfill = listingIds[0];

          await fungibleMarket.connect(owner).setFeesOn(false);

          let oldOwnerBalanceBefore = await addrs[0].getBalance();
          let newOwnerBalanceBefore = await addrs[1].getBalance();

          let tx = await fungibleMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
          let receipt = await tx.wait();
          const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

          let oldOwnerBalanceAfter = await addrs[0].getBalance();
          let newOwnerBalanceAfter = await addrs[1].getBalance();

          expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH));
          expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH).sub(gasSpent));

          expect(await token1155.ownerOf(1)).to.equal(addrs[1].address);

        });

        it("Fulfill listing feesOn sends correct token amount, autosend on", async function () {
          const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
          const address0 = addrs[0];
          await fungibleMarket.connect(owner).setAutoSendFees(true);

          const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
          const listingToFulfill = listingIds[0];

          const devFee = await fungibleMarket.devFee();
          const beanieHolderFee = await fungibleMarket.beanieHolderFee();
          const beanBuybackFee = await fungibleMarket.beanBuybackFee();
          const collectionOwnerFee = await fungibleMarket.getCollectionFee(token1155.address);
          const totalFee = devFee.add(beanieHolderFee).add(beanBuybackFee).add(collectionOwnerFee);

          const devAddress = await fungibleMarket.devAddress();
          const beanHolderAddress = await fungibleMarket.beanieHolderAddress();
          const beanBuybackAddress = await fungibleMarket.beanBuybackAddress();

          let oldOwnerBalanceBefore = await addrs[0].getBalance();
          let newOwnerBalanceBefore = await addrs[1].getBalance();
          let collectionOwnerBalBefore = await addrs[5].getBalance();

          let tx = await fungibleMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
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

          expect(await token1155.ownerOf(1)).to.equal(addrs[1].address);

        });

        it("Fulfill listing feesOn sends correct token amount, autosend off and then process", async function () {
          const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
          const address0 = addrs[0];
          await fungibleMarket.connect(owner).setAutoSendFees(false);

          const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
          const listingToFulfill = listingIds[0];

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

          let oldOwnerBalanceBefore = await addrs[0].getBalance();
          let newOwnerBalanceBefore = await addrs[1].getBalance();
          let collectionOwnerBalBefore = await addrs[5].getBalance();

          let tx = await fungibleMarket.connect(addrs[1]).fulfillListing(listingToFulfill, addrs[1].address, {value: ONE_ETH});
          let receipt = await tx.wait();
          const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice);

          expect(await fungibleMarket.accruedAdminFeesEth()).to.eql(ONE_ETH.mul(accruedAdminFees).div(10000));

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

          await fungibleMarket.connect(owner).processDevFeesEth();

          let devFeeAmount = ONE_ETH.mul(devFee).div(10000);
          let beanieHolderFeeAmount = ONE_ETH.mul(beanieHolderFee).div(10000);
          let beanBuybackFeeAmount = ONE_ETH.mul(beanBuybackFee).div(10000)
          let afterFeePrice = ONE_ETH.mul(totalFee).div(10000);

          //Check principal balances
          expect(oldOwnerBalanceAfter).to.eql(oldOwnerBalanceBefore.add(ONE_ETH).sub(afterFeePrice));
          expect(newOwnerBalanceAfter).to.eql(newOwnerBalanceBefore.sub(ONE_ETH).sub(gasSpent));

          //Check fee balances
          expect(await ethers.provider.getBalance(devAddress)).to.eql(devFeeAmount);
          expect(await ethers.provider.getBalance(beanHolderAddress)).to.eql(beanieHolderFeeAmount);
          expect(await ethers.provider.getBalance(beanBuybackAddress)).to.eql(beanBuybackFeeAmount);

          expect(await token1155.ownerOf(1)).to.equal(addrs[1].address);

        });

        it("Delist token", async function () {
          const { fungibleMarket, token1155, owner, addrs } = await loadFixture(deployMarketAndListNFTsFixture);
          const address0 = addrs[0];
          const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
          const listingToDelist = listingIds[0];

          let listingsByLister0 = await fungibleMarket.getListingsByLister(addrs[0].address);
          let listingsByLister1 = await fungibleMarket.getListingsByLister(addrs[1].address);
          let listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
          expect(listingsByLister0.length).to.equal(4)
          expect(listingsByLister1.length).to.equal(1)
          expect(listingsByContract.length).to.equal(5)

          await fungibleMarket.connect(address0).delistToken(listingToDelist);

          listingsByLister0 = await fungibleMarket.getListingsByLister(addrs[0].address);
          listingsByLister1 = await fungibleMarket.getListingsByLister(addrs[1].address);
          listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
          expect(listingsByLister0).to.not.contain(listingToDelist)
          expect(listingsByLister1).to.not.contain(listingToDelist)
          expect(listingsByContract).to.not.contain(listingToDelist)

          expect(listingsByLister0.length).to.equal(3)
          expect(listingsByLister1.length).to.equal(1)
          expect(listingsByContract.length).to.equal(4)

          //Check to see if new listingsByLister and listingsByContract is correct
          expect(await fungibleMarket.listings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
          expect(await fungibleMarket.posInListings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO]);
        });

        it("Delist token updates storage structures", async function () {
            const { fungibleMarket, token1155, owner, addrs } = await loadFixture(deployMarketAndListNFTsFixture);
            const address0 = addrs[0];
            const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
            const listingToDelist = listingIds[0];
            const listingData = await fungibleMarket.listings(listingToDelist);

            let listingsByLister0 = await fungibleMarket.getListingsByLister(addrs[0].address);
            let listingsByLister1 = await fungibleMarket.getListingsByLister(addrs[1].address);
            let listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
            expect(listingsByLister0.length).to.equal(4)
            expect(listingsByLister1.length).to.equal(1)
            expect(listingsByContract.length).to.equal(5)
            expect(await fungibleMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId))
                .to.equal(listingToDelist);
            await fungibleMarket.connect(address0).delistToken(listingToDelist);

            //Check to see if new listingsByLister and listingsByContract is correct
            //Listings
            expect(await fungibleMarket.listings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO]);
            //posInListings
            expect(await fungibleMarket.posInListings(listingToDelist)).to.eql([BIG_ZERO, BIG_ZERO]);
            //listingsByLister
            listingsByLister0 = await fungibleMarket.getListingsByLister(addrs[0].address);
            listingsByLister1 = await fungibleMarket.getListingsByLister(addrs[1].address);
            expect(listingsByLister0.length).to.equal(3)
            expect(listingsByLister1.length).to.equal(1)
            expect(listingsByLister0).to.not.contain(listingToDelist)
            expect(listingsByLister1).to.not.contain(listingToDelist)
            //listingsBycontract
            listingsByContract = await fungibleMarket.getListingsByContract(token1155.address);
            expect(listingsByContract).to.not.contain(listingToDelist)
            expect(listingsByContract.length).to.equal(4)
            //currentListingOrderHash
            expect(await fungibleMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId))
                .to.equal(ethers.utils.hexZeroPad(0x0, 32));
          });

        it("Creating a new listing for same token removes old listing.", async function () {
          const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
          const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
          const listingHash = listingIds[0];
          const listingData = await fungibleMarket.listings(listingHash);
          const currentListingOrderHash = await fungibleMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId);
          expect(currentListingOrderHash).to.equal(listingHash);

          await fungibleMarket.connect(addrs[0]).listToken(listingData.contractAddress, listingData.tokenId, ONE_ETH, now + 100);

          const listingIdsNew = await fungibleMarket.getListingsByContract(token1155.address);
          const currentListingOrderHashNew = await fungibleMarket.currentListingOrderHash(listingData.contractAddress, listingData.tokenId);
          const listingDataNew = await fungibleMarket.listings(currentListingOrderHashNew);

          //Old listing has been canceled
          expect(await fungibleMarket.listings(listingHash)).to.eql([BIG_ZERO, BIG_ZERO, BIG_ZERO, ADDR_ZERO, ADDR_ZERO])
          expect(await fungibleMarket.posInListings(listingHash)).to.eql([BIG_ZERO, BIG_ZERO]);

          expect(listingData.contractAddress, listingData.tokenId).to.equal(listingDataNew.contractAddress, listingDataNew.tokenId)
          expect(listingIdsNew).to.not.contain(currentListingOrderHash);
          expect(listingIdsNew).to.contain(currentListingOrderHashNew);
          expect(currentListingOrderHash).to.not.equal(currentListingOrderHashNew);
        });
      });

    //   describe("Fulfill listing token errors", function () {
    //     it("Cannot fulfill listing for an unlisted token", async function () {
    //       const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
    //       await expect(fungibleMarket.connect(addrs[5]).fulfillListing(ethers.utils.hexZeroPad(0x2, 32), addrs[5].address)
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_CollectionNotEnabled");
    //     });

    //     it("Cannot fulfill listing by sending too little ETH", async function () {
    //       const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
    //       const address0 = addrs[0];

    //       expect(await token1155.ownerOf(1)).to.equal(addrs[0].address);
    //       const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
    //       const listingToFulfill = listingIds[0];
    //       const listingData = await fungibleMarket.listings(listingToFulfill);

    //       await expect(fungibleMarket.connect(addrs[5]).fulfillListing(
    //         listingToFulfill, addrs[1].address, {value: listingData.price.div(2)})
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_NotEnoughEthSent");
    //     });

    //     it("Cannot fulfill listing if past expiry", async function () {
    //       const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
    //       const address0 = addrs[0];

    //       expect(await token1155.ownerOf(1)).to.equal(addrs[0].address);
    //       const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
    //       const listingToFulfill = listingIds[0];
    //       const listingData = await fungibleMarket.listings(listingToFulfill);

    //       await network.provider.send("evm_setNextBlockTimestamp", [Number(listingData.expiry) + 10])
    //       await network.provider.send("evm_mine")

    //       await expect(fungibleMarket.connect(addrs[5]).fulfillListing(
    //         listingToFulfill, addrs[1].address, {value: listingData.price})
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_OrderExpired");
    //     });

    //     it("Cannot fulfill listing if token owner has changed", async function () {
    //       const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);
    //       const address0 = addrs[0];

    //       expect(await token1155.ownerOf(1)).to.equal(addrs[0].address);

    //       const listingIds = await fungibleMarket.getListingsByContract(token1155.address);
    //       const listingToFulfill = listingIds[0];
    //       const listingData = await fungibleMarket.listings(listingToFulfill);

    //       await token1155.connect(addrs[0]).transferFrom(addrs[0].address, addrs[1].address, listingData.tokenId);

    //       await expect(fungibleMarket.connect(addrs[5]).fulfillListing(
    //         listingToFulfill, addrs[4].address, {value: listingData.price})
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_ListingNotActive");
    //     });
    //   })

    //   describe("Delist token errors and delist cases", function () { // works, fixtures just break -- hh problem
    //     it("Cannot delist unowned token", async function () {
    //       const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

    //       const listings = await fungibleMarket.getListingsByContract(token1155.address);
    //       const listing0hash = listings[0];
    //       const listing0Data = await fungibleMarket.listings(listing0hash);

    //       await expect(fungibleMarket.connect(addrs[5]).delistToken(listing0hash)
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_DelistNotApproved");
    //     });

    //     it("Can delist unowned token if caller is admin", async function () {
    //       const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

    //       const listings = await fungibleMarket.getListingsByContract(token1155.address);
    //       const listing0hash = listings[0];
    //       const listing0Data = await fungibleMarket.listings(listing0hash);

    //       await fungibleMarket.connect(owner).delistToken(listing0hash);
    //     });

    //     it("Anyone can delist token if lister is no longer token owner.", async function () {
    //       const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

    //       const listings = await fungibleMarket.getListingsByContract(token1155.address);
    //       const listing0hash = listings[0];
    //       const listing0Data = await fungibleMarket.listings(listing0hash);

    //       await expect(fungibleMarket.connect(addrs[2]).delistToken(listing0hash)
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_DelistNotApproved");

    //       await token1155.connect(addrs[0]).transferFrom(addrs[0].address, addrs[1].address, listing0Data.tokenId);
    //       await fungibleMarket.connect(addrs[2]).delistToken(listing0hash);
    //     });

    //     it("Anyone can delist token if token is contract is no longer approved for all.", async function () {
    //         const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

    //         const listings = await fungibleMarket.getListingsByContract(token1155.address);
    //         const listing0hash = listings[0];
    //         const listing0Data = await fungibleMarket.listings(listing0hash);

    //         await expect(fungibleMarket.connect(addrs[2]).delistToken(listing0hash)
    //           ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_DelistNotApproved");

    //         await token1155.connect(addrs[0]).setApprovalForAll(fungibleMarket.address, false);
    //         await fungibleMarket.connect(addrs[2]).delistToken(listing0hash);
    //       });

    //     it("Anyone can delist token if expiry has passed.", async function () {
    //       const { fungibleMarket, token1155, paymentToken, owner, addrs, now } = await loadFixture(deployMarketAndListNFTsFixture);

    //       const listings = await fungibleMarket.getListingsByContract(token1155.address);
    //       const listing0hash = listings[0];
    //       const listing0Data = await fungibleMarket.listings(listing0hash);

    //       await expect(fungibleMarket.connect(addrs[2]).delistToken(listing0hash)
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_DelistNotApproved");

    //       await network.provider.send("evm_setNextBlockTimestamp", [Number(listing0Data.expiry) - 10])
    //       await network.provider.send("evm_mine")

    //       await expect(fungibleMarket.connect(addrs[2]).delistToken(listing0hash)
    //         ).to.be.revertedWithCustomError(fungibleMarket, "BEAN_DelistNotApproved");

    //       await network.provider.send("evm_setNextBlockTimestamp", [Number(listing0Data.expiry) + 10])
    //       await network.provider.send("evm_mine")

    //       await fungibleMarket.connect(addrs[2]).delistToken(listing0hash);
    //     });
    //   });
});