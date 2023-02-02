
const hre = require("hardhat");

async function main() {
  const MoonbeansUnique = await hre.ethers.getContractFactory("MoonbeansUnique");
  const mbnft = await MoonbeansUnique.deploy();

  await mbnft.deployed();

  console.log("MoonbeansUnique deployed to:", mbnft.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
