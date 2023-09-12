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

describe("Sell orders (1155)", function () {
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

        return { fungibleMarket, feeProcessor, token1155, weth, owner, admin, addrs, now };
    }
    describe("Sell order debug", function () {
        it.only("Sell order debug", async function () {
            //Make first order
            const { fungibleMarket, token1155, owner, addrs, now } = await loadFixture(deployMarketAndNFTFixture);
            const address0 = addrs[0];
            const address1 = addrs[1];

            await token1155.connect(address0).setApprovalForAll(fungibleMarket.address, true);
            await token1155.connect(address1).setApprovalForAll(fungibleMarket.address, true);

            const tradeFlags1 = {
                tradeType: 1,
                allowPartialFills: true,
                isEscrowed: false
            }

            let openTradeTx1 = await fungibleMarket.connect(address0).openTrade(
                token1155.address,
                1,
                1,
                ethers.BigNumber.from("1000000000000000000"),
                0,
                tradeFlags1 
            );

            let receipt1 = await openTradeTx1.wait();
            let orderHash1 = receipt1.logs[0].topics[1];

            let orderData1 = await fungibleMarket.trades(orderHash1);
            // UGLY BUT TRUE
            expect(orderData1).to.eql(
                [
                    bigNum(1),
                    bigNum(1),
                    ethers.BigNumber.from("1000000000000000000"),
                    bigNum(0),
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

            let sellOrderTest = await fungibleMarket.getSellOrdersByUser(address0.address);
            expect(sellOrderTest).to.eql([orderHash1])

            //Make second order

            let openTradeTx2 = await fungibleMarket.connect(address0).openTrade(
                token1155.address,
                1,
                1,
                ethers.BigNumber.from("1000000000000000000"),
                0,
                tradeFlags1 
            );

            let receipt2 = await openTradeTx2.wait();
            let orderHash2 = receipt2.logs[0].topics[1];

            let orderData2 = await fungibleMarket.trades(orderHash2);
            // UGLY BUT TRUE
            expect(orderData2).to.eql(
                [
                    bigNum(1),
                    bigNum(1),
                    ethers.BigNumber.from("1000000000000000000"),
                    bigNum(0),
                    bigNum(1),
                    token1155.address,
                    address0.address,
                    [
                        1,
                        true,
                        false,
                    ]
                ]
            )

            sellOrderTest = await fungibleMarket.getSellOrdersByUser(address0.address);
            expect(sellOrderTest).to.eql([orderHash1, orderHash2])

            // Fill first order
            let fill1 = await fungibleMarket.connect(addrs[5]).acceptTrade(
                orderHash1, 1, { value: ethers.BigNumber.from("1000000000000000000") })
                
            await fill1.wait();

            sellOrderTest = await fungibleMarket.getSellOrdersByUser(address0.address);
            expect(sellOrderTest).to.eql([orderHash2])

            //  Make 3rd order
            let openTradeTx3 = await fungibleMarket.connect(address0).openTrade(
                token1155.address,
                1,
                1,
                ethers.BigNumber.from("1000000000000000000"),
                0,
                tradeFlags1 
            );

            let receipt3 = await openTradeTx3.wait();
            let orderHash3 = receipt3.logs[0].topics[1];

            let orderData3 = await fungibleMarket.trades(orderHash3);
            // UGLY BUT TRUE
            expect(orderData3).to.eql(
                [
                    bigNum(1),
                    bigNum(1),
                    ethers.BigNumber.from("1000000000000000000"),
                    bigNum(0),
                    bigNum(1),
                    token1155.address,
                    address0.address,
                    [
                        1,
                        true,
                        false,
                    ]
                ]
            )

            sellOrderTest = await fungibleMarket.getSellOrdersByUser(address0.address);

            expect(sellOrderTest).to.eql([orderHash2, orderHash3])
            expect(sellOrderTest.length).to.equal(2);

            // Fill old 2nd order

            let fill2 = await fungibleMarket.connect(addrs[5]).acceptTrade(
                orderHash2, 1, { value: ethers.BigNumber.from("1000000000000000000") })

            await fill2.wait();

            orderData3 = await fungibleMarket.trades(orderHash3);
            console.log(orderData3);

            console.log(orderHash1);
            console.log(orderHash2);
            console.log(orderHash3);

            sellOrderTest = await fungibleMarket.getSellOrdersByUser(address0.address);

            expect(sellOrderTest).to.eql([orderHash3])
            expect(sellOrderTest.length).to.equal(1);

        });
    });
});