import logger from './helpers/logger';
import { EOA, POOL } from './helpers/signature';
import { sendMessage } from './helpers/webSocket';

// TODO: Add supported networks/pairs (1 is mainnet)
const SUPPORTED_PAIRS = {
  1: [['ETH', 'DAI'], ['DAI', 'ETH'], ['USDC', 'USDT']]  // Example values
}

const cachedQuotes = {}

export function processMessage(ws, message) {
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
  if (!(message.networkId in SUPPORTED_PAIRS)) {
    sendMessage(ws, 'pairs', { networkId: message.networkId, pairs: [] });
  }

  const pairs = []
  for (const pair of SUPPORTED_PAIRS[network]) {
    pairs.push({ baseTokenName: pair[0], quoteTokenName: pair[1]});
  }

  const apiPairs = {
    networkId: message.networkId,
    pairs,
  };
  sendMessage(ws, 'pairs', apiPairs);
}

function processMessageRfq(ws, message) {
  if (!(SUPPORTED_NETWORKS.includes(message.networkId))) {
    logger.error(`RFQ for unsupported network: ${JSON.stringify(message)}`);
    return;
  }

  if (!message.rfqId) {
    logger.error(`Missing rfqId in 'rfq' request. ${JSON.stringify(message)}`);
    return;
  }

  // TODO: Implement your own pricing logic
  const apiQuote = {
    networkId: message.networkId,
    rfqId: message.rfqId,
    pool: POOL,
    eoa: EOA,
    // TODO(optional): Add "eoa: '0x...'" if using EOA for market making
    baseToken: rfq.baseToken,  // EVM-address
    quoteToken: rfq.quoteToken,  // EVM-address
    baseTokenAmount: '1000000000',  // EVM-decimal notation
    quoteTokenAmount: '1000000000',  // EVM-decimal notation
    fees: '0',
    quoteExpiry: Math.floor(Date.now() / 1000) + 180,  // 3 minutes
  };

  // Cache data to validate during signing
  cachedQuotes[message.rfqId] = {
    ...apiQuote, 
    trader: message.trader, 
    effectiveTrader: message.effectiveTrader
  }

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

  // TODO (mib): Sign quote
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

export function publishPriceLevels(ws) {
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