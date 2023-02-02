const hre = require("hardhat");
// import { addressesMoonriver } from "../constants";

async function main() {
    // const FeeProcessor = await ethers.getContractFactory("YespFeeProcessor");
    // const feeProcessor = await FeeProcessor.deploy(addressesMoonriver.WETH);
    // console.log('Deploying Fee Processor');
    // await feeProcessor.deployed();
    // console.log(`Fee Processor deployed to: ${feeProcessor.address}.`);

    // const Market = await ethers.getContractFactory("Market");
    // const market = await Market.deploy(addressesMoonriver.WETH, feeProcessor.address);
    // console.log('Deploying ERC721 Marketplace');
    // await market.deployed();
    // console.log(`ERC721 Marketplace deployed to: ${market.address}.`);

    // const FungibleMarket = await ethers.getContractFactory("FungibleMarket");
    // const fungibleMarket = await FungibleMarket.deploy(addressesMoonriver.WETH, feeProcessor.address);
    // console.log('Deploying ERC1155 Marketplace');
    // await fungibleMarket.deployed();
    // console.log(`ERC1155 Marketplace deployed to: ${fungibleMarket.address}.`);

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
