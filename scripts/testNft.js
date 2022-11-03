
const hre = require("hardhat");

async function main() {

    const NFT = await ethers.getContractFactory("ERC721Mock");
    const dummyNFT = await NFT.attach("0xf27a6c72398eb7e25543d19fda370b7083474735");

    let owner = await dummyNFT.ownerOf(721)
    let balance = await dummyNFT.balanceOf("0x5bf3d8f19b31293a4b1b1048eb5ad42c209af04d");

    console.log(owner);
    console.log(balance);

    let owner2Bal = await dummyNFT.balanceOf("0xa3529e1f877a9453aa6053d66d7d4f07827e8e86");

    console.log(owner2Bal);

    // console.log("TokenOwnershipWrapper deployed to:", greeter.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});