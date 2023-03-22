require("dotenv").config();

require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require('hardhat-contract-sizer');
require("solidity-coverage");
require("@nomicfoundation/hardhat-chai-matchers");

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.14",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000
          }
        },
      },
      {
        version: "0.4.18",
      },
    ]
  },
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
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
    },
    arbitrumGoerli: {
      url: "https://goerli-rollup.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY ?? '']
    },
    arbitrumNova: {
      url: "https://nova.arbitrum.io/rpc",
      accounts: [process.env.PRIVATE_KEY ?? '']
    },
    arbitrumOne: {
      url: "https://arbitrum-one.public.blastapi.io",
      accounts: [process.env.PRIVATE_KEY ?? '']
    },
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
      moonbeam:  process.env.MOONBEAM_API_KEY ?? "",
      arbitrumGoerli: process.env.ARBITRUM_GOERLI_API_KEY ?? "",
      arbitrumOne: process.env.ARBITRUM_ONE_API_KEY ?? "",
      arbitrumNova: process.env.ARBITRUM_NOVA_API_KEY ?? "",
    },
    customChains: [
      {
        network: "arbitrumNova",
        chainId: 42170,
        urls: {
          apiURL: "https://api-nova.arbiscan.io/api",
          browserURL: "https://nova.arbiscan.io"
        }
      }
    ]
  },
};
