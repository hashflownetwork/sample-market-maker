const { BigNumber } = require('@hashflow/hashflow');

const logger = require('./helpers/logger');
const { convertFromDecimals, convertToDecimals } = require('./helpers/token');

// TODO: Add supported networks/pairs (1 is mainnet)
const SUPPORTED_PAIRS = {
  1: [['ETH', 'DAI'], ['DAI', 'ETH'], ['USDC', 'USDT']]  // Example values
};

function computePrices(networkId, baseToken, quoteToken, baseTokenAmount, quoteTokenAmount) {
  const baseAmountNumber = convertFromDecimals(new BigNumber(baseTokenAmount), baseToken, networkId);
  const quoteAmountNumber = convertFromDecimals(new BigNumber(quoteTokenAmount), quoteToken, networkId);

  // TODO: Add own pricing logic
  const rate = computeRate(networkId, baseToken.name, quoteToken.name, baseAmountNumber, quoteAmountNumber);

  var baseAmountRaw, quoteAmountRaw;
  if (baseTokenAmount) {
    baseAmountRaw = baseAmountNumber;
    quoteAmountRaw = baseAmountNumber.multipliedBy(rate);
  } else if (quoteTokenAmount) {
    baseAmountRaw = quoteAmountNumber.dividedBy(rate);
    quoteAmountRaw = quoteAmountNumber;
  } else {
    logger.error(`Neither base nor quoteTokenAmount set!`);
    return {};
  }

  return {
    baseTokenAmount: convertToDecimals(baseAmountRaw, baseToken, networkId),
    quoteTokenAmount: convertToDecimals(quoteAmountRaw, quoteToken, networkId)
  };
}

function computeRate(networkId, baseTokenName, quoteTokenName, baseAmount, quoteAmount) {
  if (baseTokenName === 'ETH' && quoteTokenName === 'DAI') {
    return new BigNumber(3000);
  } else if (baseTokenName === 'DAI' && quoteTokenName === 'ETH') {
    return new BigNumber(1).dividedBy(3000);
  } else if (baseTokenName === 'USDC' && quoteTokenName === 'USDT') {
    return new BigNumber(1);
  } else {
    return undefined;
  }
}

module.exports = { SUPPORTED_PAIRS, computePrices };