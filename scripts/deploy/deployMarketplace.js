const hre = require("hardhat");

async function main() {

    const BeanieDistributor = await hre.ethers.getContractFactory("BeanieDistributor");
    const beanieDist = await BeanieDistributor.deploy();
    console.log('Deploying Beanie Distributor');
    await beanieDist.deployed();
    console.log("BeanieDistributor deployed to:", beanieDist.address);

    const FeeProcessor = await ethers.getContractFactory("BeanFeeProcessor");
    const feeProcessor = await FeeProcessor.deploy(addressesArbitrumNova.WETH);
    console.log('Deploying Fee Processor');
    await feeProcessor.deployed();
    console.log(`Fee Processor deployed to: ${feeProcessor.address}.`);

    const BeanieMarketV11 = await ethers.getContractFactory("BeanieMarketV11");
    const market = await BeanieMarketV11.deploy(addressesArbitrumNova.WETH, addressesArbitrumNova.FeeProcessor);
    console.log('Deploying ERC721 Marketplace');
    await market.deployed();
    console.log(`ERC721 Marketplace deployed to: ${market.address}.`);

    const FungibleBeanieMarketV1 = await ethers.getContractFactory("FungibleBeanieMarketV1");
    const fungibleMarket = await FungibleBeanieMarketV1.deploy(addressesArbitrumNova.WETH, addressesArbitrumNova.FeeProcessor);
    console.log('Deploying ERC1155 Marketplace');
    await fungibleMarket.deployed();
    console.log(`ERC1155 Marketplace deployed to: ${fungibleMarket.address}.`);

    const StorefrontOwnership = await hre.ethers.getContractFactory("StorefrontOwnership");
    const storefrontOwnership = await StorefrontOwnership.deploy();
    console.log('Deploying Storefront Ownership');
    await storefrontOwnership.deployed();
    console.log(`Storefront Ownership Contract deployed to: ${storefrontOwnership.address}.`);

    console.log("INIT COMPLETE");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
