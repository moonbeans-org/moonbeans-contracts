require("dotenv").config();

require('@openzeppelin/hardhat-upgrades');
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
    moonbaseAlpha: {
      url: "https://moonbeam-alpha.api.onfinality.io/public",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],    },
    moonriver: {
      url: "https://moonriver.api.onfinality.io/public",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      moonriver: "",
      moonbaseAlpha: ""
    }
  },
};
