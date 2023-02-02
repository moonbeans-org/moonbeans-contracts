const hre = require("hardhat");

async function main() {

  // We get the contract to deploy
  const ExiledRacerPlaceholder = await hre.ethers.getContractFactory("ExiledRacerPlaceholder");
  const exrp = await ExiledRacerPlaceholder.deploy();

  await exrp.deployed();

  console.log("ExiledRacerPlaceholder deployed to:", exrp.address);

  const PrivateAuction = await hre.ethers.getContractFactory("PrivateAuction");
  const pa = await PrivateAuction.deploy();

  await pa.deployed();

  console.log("PrivateAuction deployed to:", pa.address);

  await exrp.transferFrom('0x24312a0b911fE2199fbea92efab55e2ECCeC637D', pa.address, 0);
  await exrp.transferFrom('0x24312a0b911fE2199fbea92efab55e2ECCeC637D', pa.address, 1);
  await exrp.transferFrom('0x24312a0b911fE2199fbea92efab55e2ECCeC637D', pa.address, 2);

  await pa.setNFTContract(exrp.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
