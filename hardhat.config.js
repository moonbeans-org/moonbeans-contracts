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
        runs: 200
      }
    }
  },
  networks: {
    moonbaseAlpha: {
      url: "https://moonbeam-alpha.api.onfinality.io/public",
      accounts: ['']
    },
    moonriver: {
      url: "https://moonriver.api.onfinality.io/public",
      accounts: ['']
    }
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
