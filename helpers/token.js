const { BigNumber } = require('@hashflow/hashflow');

const Networks = {
  MAINNET: 1,
  KOVAN: 42,
  POLYGON: 137,
  MUMBAI: 80001,
  BSC: 56,
  BSCTESTNET: 97,
  ARBITRUM: 42161,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TOKENS = [
  {
    name: 'ETH',
    displayName: 'Ethereum',
    decimalsByNetworkId: {
      [Networks.MAINNET]: 18,
      [Networks.KOVAN]: 18,
    },
    addressByNetworkId: {
      [Networks.MAINNET]: ZERO_ADDRESS,
      [Networks.KOVAN]: ZERO_ADDRESS,
    },
  },
  {
    name: 'USDC',
    displayName: 'USD Coin',
    decimalsByNetworkId: {
      [Networks.MAINNET]: 6,
      [Networks.KOVAN]: 6,
      [Networks.POLYGON]: 6,
      [Networks.MUMBAI]: 6,
      [Networks.ARBITRUM]: 6,
    },
    addressByNetworkId: {
      [Networks.MAINNET]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      [Networks.KOVAN]: '0x12f40ef6e4d2b9950236546e2bc0b6f31973d8bf',
      [Networks.POLYGON]: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      [Networks.MUMBAI]: '0x36c543b8bb76b330ecb66a13c1c1377f889f1919',
      [Networks.ARBITRUM]: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
    },
  },
  {
    name: 'USDT',
    displayName: 'Tether',
    decimalsByNetworkId: {
      [Networks.MAINNET]: 6,
      [Networks.KOVAN]: 6,
      [Networks.POLYGON]: 6,
      [Networks.MUMBAI]: 6,
      [Networks.BSC]: 18,
      [Networks.ARBITRUM]: 6,
    },
    addressByNetworkId: {
      [Networks.MAINNET]: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      [Networks.KOVAN]: '0x07de306ff27a2b630b1141956844eb1552b956b5',
      [Networks.POLYGON]: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      [Networks.MUMBAI]: '0x9a87ed07cfa58339073745996945853f5289ea43',
      [Networks.BSC]: '0x55d398326f99059ff775485246999027b3197955',
      [Networks.ARBITRUM]: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    },
  },
  {
    name: 'DAI',
    displayName: 'DAI',
    decimalsByNetworkId: {
      [Networks.MAINNET]: 18,
      [Networks.KOVAN]: 18,
      [Networks.POLYGON]: 18,
      [Networks.MUMBAI]: 18,
    },
    addressByNetworkId: {
      [Networks.MAINNET]: '0x6b175474e89094c44da98b954eedeac495271d0f',
      [Networks.KOVAN]: '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
      [Networks.POLYGON]: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
      [Networks.MUMBAI]: '0x001b3b4d0f3714ca98ba10f6042daebf0b1b7b6f',
    },
  },

  // TODO: Add other tokens you support
];

function getTokenByAddress(networkId, address) {
  return TOKENS.find(
    t => t.addressByNetworkId[networkId]?.toLowerCase() === address.toLowerCase()
  );
}

function getTokenByName(name)  {
  return TOKENS.find(t => t.name.toUpperCase() === name.toUpperCase());
}

function convertFromDecimals(amount, token, networkId) {
  const decimals = token.decimalsByNetworkId[networkId];
  return amount.dividedBy(new BigNumber(10).pow(decimals));
}

function convertToDecimals(amount, token, networkId) {
  const decimals = token.decimalsByNetworkId[networkId];
  return amount.multipliedBy(new BigNumber(10).pow(decimals));
}

module.exports = { TOKENS, getTokenByAddress, getTokenByName, convertFromDecimals, convertToDecimals }
