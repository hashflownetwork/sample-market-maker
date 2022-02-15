const logger = require('./helpers/logger');
const { EOA, POOL, signQuote } = require('./helpers/signature');
const { getTokenByAddress } = require('./helpers/token');
const { sendMessage } = require('./helpers/webSocket');
const { SUPPORTED_PAIRS, computePrices } = require('./pricing');

const cachedQuotes = {};

function processMessage(ws, message) {
  logger.info(`Received message ${message.toString()}`);

  const decodedMessage = JSON.parse(message.toString());
  if (!decodedMessage) {
    logger.info(`Cannot parse message`);
    return;
  }

  switch (decodedMessage.messageType) {
    case 'getPairs':
      processMessageGetPairs(ws, decodedMessage.message);
      return;
    case 'rfq':
      processMessageRfq(ws, decodedMessage.message);
      return;
    case 'signQuote':
      processMessageSignQuote(ws, decodedMessage.message);
      return;
    case 'trade':
      processMessageTrade(ws, decodedMessage.message);
      return;
    case 'error': 
      logger.error(`WS 'error' message: ${message}`);
      return;
    default:
      logger.error(`Unknown message type: ${message}`);
      return;
  }
}

function processMessageGetPairs(ws, message) {
  const networkId = message.networkId;
  if (!(networkId in SUPPORTED_PAIRS)) {
    sendMessage(ws, 'pairs', { networkId: networkId, pairs: [] });
    return;
  }

  const pairs = []
  for (const pair of SUPPORTED_PAIRS[message.networkId]) {
    pairs.push({ baseTokenName: pair[0], quoteTokenName: pair[1]});
  }

  const apiPairs = { networkId, pairs, };
  sendMessage(ws, 'pairs', apiPairs);
}

function processMessageRfq(ws, message) {
  const networkId = message.networkId;
  if (!(networkId in SUPPORTED_PAIRS)) {
    logger.error(`RFQ for unsupported network: ${JSON.stringify(message)}`);
    return;
  }

  if (!message.rfqId) {
    logger.error(`Missing rfqId in 'rfq' request. ${JSON.stringify(message)}`);
    return;
  }

  const baseToken = getTokenByAddress(networkId, message.baseToken);
  if (!baseToken) {
    logger.error(`Unknown base token: ${message.baseToken}`);
    return;
  }

  const quoteToken = getTokenByAddress(networkId, message.quoteToken);
  if (!quoteToken) {
    logger.error(`Unknown quote token: ${message.quoteToken}`);
    return;
  }

  var pairSupported = false;
  SUPPORTED_PAIRS[networkId].forEach(pair => { 
    if (pair[0] === baseToken.name && pair[1] === quoteToken.name) {
      pairSupported = true;
    };
  });

  if (!pairSupported) {
    logger.error(`Unsupported trading pair [${baseToken.name}, ${quoteToken.name}] on ${networkId}`);
    return;
  }

  const { baseTokenAmount, quoteTokenAmount } = computePrices(
    networkId,
    baseToken,
    quoteToken,
    message.baseTokenAmount, 
    message.quoteTokenAmount
  );

  const apiQuote = {
    networkId: networkId,
    rfqId: message.rfqId,
    pool: POOL,
    eoa: EOA,
    baseToken: message.baseToken,  // EVM-address
    quoteToken: message.quoteToken,  // EVM-address
    baseTokenAmount: baseTokenAmount.toFixed(),  // EVM-decimal notation string
    quoteTokenAmount: quoteTokenAmount.toFixed(),  // EVM-decimal notation string
    fees: '0',
    quoteExpiry: Math.floor(Date.now() / 1000) + 180,  // 3 minutes
  };

  // Cache data to validate during signing
  cachedQuotes[message.rfqId] = {
    ...apiQuote, 
    trader: message.trader, 
    effectiveTrader: message.effectiveTrader
  };

  sendMessage(ws, 'quote', apiQuote);
}

function processMessageSignQuote(ws, message) {
  if (
    !(message.rfqId in cachedQuotes) || 
    !(validateQuotesMatch(message.quoteData, cachedQuotes[message.rfqId]))
  ) {
    logger.error(`Requesting signature for unrecognized quote. ${JSON.stringify(message)}`)
    return;
  }

  const apiSignature = {
    txid: message.quoteData.txid,
    signature: signQuote(message.quoteData),
  };

  sendMessage(ws, 'signature', apiSignature);
}

function processMessageTrade(ws, message) {
  const {
    networkId,
    rfqId,
    rfqSource,
    txid,
    blockNumber,
    blockHash,
    transactionHash,
    blockTimestamp,
    baseToken,
    quoteToken,
    baseTokenName,
    quoteTokenName,
    baseTokenNumDecimals,
    quoteTokenNumDecimals,
    baseTokenAmount,
    quoteTokenAmount,
    fees,
    pool,
    trader,
    effectiveTrader,
    status,
  } = message;

  // TODO: Store trade information for analytics and bookkeeping

  sendMessage(ws, 'tradeAck', txid);
}

function validateQuotesMatch(signQuoteData, cachedQuote) {
  return signQuoteData.pool === cachedQuote.pool 
    && signQuoteData.eoa === cachedQuote.eoa
    && signQuoteData.baseToken === cachedQuote.baseToken
    && signQuoteData.quoteToken === cachedQuote.quoteToken
    && signQuoteData.baseTokenAmount === cachedQuote.baseTokenAmount
    && signQuoteData.quoteTokenAmount === cachedQuote.quoteTokenAmount
    && signQuoteData.fees === cachedQuote.fees
    && signQuoteData.trader === cachedQuote.trader
    && signQuoteData.effectiveTrader === cachedQuote.effectiveTrader;
}

function publishPriceLevels(ws) {
  for (network of Object.keys(SUPPORTED_PAIRS)) {
    for (pairs of SUPPORTED_PAIRS[network]) {
      // TODO (if market making on aggregators): Implement own price levels
      const levels = [{level: "1", price: "10000"}, {level: "2", price: "20000"}];

      const apiPriceLevels = {
        networkId: network,
        baseTokenName: pairs[0],
        quoteTokenName: pairs[1],
        levels
      };
      sendMessage(ws, 'priceLevels', apiPriceLevels);
    }
  } 
}

module.exports = { processMessage, publishPriceLevels };