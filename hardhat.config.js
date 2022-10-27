require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");

module.exports = {
  solidity: {
    version: "0.8.14",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000
      }
    }
  },
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [process.env.PRIVATE_KEY ?? '']
    },
    moonbaseAlpha: {
      url: "https://moonbeam-alpha.api.onfinality.io/public",
      accounts: [process.env.PRIVATE_KEY ?? '']
    },
    moonriver: {
      url: "https://moonriver.api.onfinality.io/public",
      accounts: [process.env.PRIVATE_KEY ?? '']
    },
    moonbeam: {
      url: "https://rpc.api.moonbeam.network",
      accounts: [process.env.PRIVATE_KEY ?? '']
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY ?? "",
      moonriver: process.env.MOONRIVER_API_KEY ?? "",
      moonbaseAlpha:  process.env.MOONBASE_API_KEY ?? "",
      moonbeam:  process.env.MOONBEAM_API_KEY ?? ""
    }
  },
};
