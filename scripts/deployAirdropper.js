const hre = require("hardhat");

async function main() {

  // We get the contract to deploy
  const SeedAirdropper = await hre.ethers.getContractFactory("SeedAirdropper");
  const greeter = await SeedAirdropper.deploy();

  await greeter.deployed();

  console.log("airdropper deployed to:", greeter.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
