const hashflow = require('@hashflow/hashflow');
const BigNumber = hashflow.BigNumber
const {plot, Plot} = require('nodeplotlib');

const NETWORK_ID_NAME_MAP = {
  1: 'mainnet',
  42: 'kovan',
  137: 'polygon',
  80001: 'mumbai',
  56: 'bsc',
  97: 'bsctestnet',
  42161: 'arbitrum',
  43114: 'avalanche',
};

async function tradingStats() {
  const chainWeight = {
    1: 0.26,
    43114: 0.26,
    56: 0.16,
    137: 0.16,
    42161: 0.16
  };
  const numberHFT = 625000;
  const hftPrice = 0.7;

  const blueChips = new Set([
    'ETH', 'WETH', 'WBTC', 'MATIC', 'WMATIC', 'AVAX', 'WAVAX', 'BNB', 'WBNB', 'AETH',
    'USDC', 'USDT', 'DAI', 'USDC.e', 'USDT.e', 'BUSD'
  ]);

  const tradesQuery = `
  SELECT *
  FROM trades
  WHERE
    rfq_source = 'hashflow'
    AND network_id IN (1, 137, 56, 42161, 43114)
    AND block_timestamp >= CAST('2022-03-14 00:00:00' AS TIMESTAMP)
    AND block_timestamp < CAST('2022-03-21 00:00:00' AS TIMESTAMP)
  ORDER BY block_timestamp;
  `;

  const tokensQuery = `
  SELECT *
  FROM tokens
  WHERE network_id IN (1, 137, 56, 42161, 43114)
  `;

  const tokenPricesQuery = `
  SELECT *
  FROM token_prices
  WHERE start_time >= CAST('2022-03-13 00:00:00' AS TIMESTAMP)
  ORDER BY start_time
  `;

  const conn = await getPostgresConnection();

  const tokens = (await conn.query(tokensQuery)).rows;
  const trades = (await conn.query(tradesQuery)).rows;
  const tokenPrices = (await conn.query(tokenPricesQuery)).rows;

  const priceIndex = {};
  for (const tokenPrice of tokenPrices) {
    const tokenName = tokenPrice.token_name;
    if (!priceIndex[tokenName]) {
      priceIndex[tokenName] = [];
    }
    priceIndex[tokenName].push({
      startTime: tokenPrice.start_time,
      price: new BigNumber(tokenPrice.price),
    });
  }

  const priceCursor = {};

  const volumePerTrader = {};
  const volumePerChain = {};
  const totalVolumePerTrader = {};

  const tradesPerTrader = {};
  const flowStackPerTrader = {};

  console.log(`Loaded ${tokens.length} tokens`);
  console.log(`Loaded ${trades.length}, trades`);

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const networkId = trade.network_id;
    const baseToken = getTokenByName(tokens, trade.network_id, trade.base_token_name);
    const quoteToken = getTokenByName(tokens, trade.network_id, trade.quote_token_name);

    const baseTokenName = trade.base_token_name;
    const baseTokenDecimals = baseToken.decimals;
    const baseTokenAmount = new BigNumber(trade.base_token_amount);
    const quoteTokenAmount = new BigNumber(trade.quote_token_amount);

    if (!priceIndex[baseTokenName]) {
      throw new Error(`Could not find prices for token ${networkId}:${baseTokenName}`);
    }
    if (!priceCursor[baseTokenName]) {
      priceCursor[baseTokenName] = 0;
    }
    while (
      (priceCursor[baseTokenName] + 1) < priceIndex[baseTokenName].length &&
      priceIndex[baseTokenName][priceCursor[baseTokenName] + 1].startTime <= trade.block_timestamp
    ) {
      priceCursor[baseTokenName] += 1;
    }
    const tradeBaseTokenPriceUsd = new BigNumber(trade.base_token_price_usd);
    const baseTokenPriceUsd = tradeBaseTokenPriceUsd.gt(0)
      ? tradeBaseTokenPriceUsd
      : priceIndex[baseTokenName][priceCursor[baseTokenName]];
    const volume = baseTokenAmount.dividedBy(
      new BigNumber(10).pow(baseTokenDecimals)
    ).multipliedBy(baseTokenPriceUsd).toNumber();

    const trader = trade.trader;

    const isBlueChip = blueChips.has(baseToken.name) && blueChips.has(quoteToken.name);
    const blueChipKey = isBlueChip ? 'blue-chip' : 'non-blue-chip';
    
    /* ---- Check if washtrade ---- */
    if (!flowStackPerTrader[trader]) {
      flowStackPerTrader[trader] = {};
    }

    if (!flowStackPerTrader[trader][networkId]) {
      flowStackPerTrader[trader][networkId] = {};
    }

    if (!flowStackPerTrader[trader][networkId][baseTokenName]) {
      flowStackPerTrader[trader][networkId][baseTokenName] = [];
    }

    const flowStack = flowStackPerTrader[trader][networkId][baseTokenName];
    const startLength = flowStack.length;
    const maxSteps = 5;
    let washTradeAmount = new BigNumber(0);
    while (flowStack.length > 0 && flowStack.length > startLength - maxSteps) {
      const prevFlow = flowStack.pop();
      if (withinTolerance(prevFlow.usdPrice, baseTokenPriceUsd, 0.02)) {
        washTradeAmount = washTradeAmount.plus(prevFlow.tokenAmount);
        if (washTradeAmount.gt(baseTokenAmount)) {
          const remainder = washTradeAmount.minus(baseTokenAmount);
          if (remainder.gt(0)) {
            flowStackPerTrader[trader][networkId][baseTokenName].push({
              tokenAmount: remainder,
              usdPrice: prevFlow.usdPrice,
            })
            washTradeAmount = baseTokenAmount;
          }
          break;
        }
      } 
    }

    const isWashTrade = washTradeAmount.gt(0);
    const washTradeVolume = washTradeAmount.dividedBy(
      new BigNumber(10).pow(baseTokenDecimals)
    ).multipliedBy(baseTokenPriceUsd).toNumber();
    const legitVolume = volume - washTradeVolume;

    if (!flowStackPerTrader[trader][networkId][quoteToken.name]) {
      flowStackPerTrader[trader][networkId][quoteToken.name] = [];
    }

    flowStackPerTrader[trader][networkId][quoteToken.name].push({
      tokenAmount: quoteTokenAmount,
      usdPrice: baseTokenPriceUsd,
    });

    /* ---- End washtrade check ---- */


    // Add trader volume
    if (!volumePerTrader[trader]) {
      volumePerTrader[trader] = {};
    }
    if (!volumePerTrader[trader][networkId]) {
      volumePerTrader[trader][networkId] = { 
        'blue-chip': {'wash-trade': 0, 'legit': 0}, 
        'non-blue-chip': {'wash-trade': 0, 'legit': 0},
      }
    }

    volumePerTrader[trader][networkId][blueChipKey]['wash-trade'] += washTradeVolume;
    volumePerTrader[trader][networkId][blueChipKey]['legit'] += legitVolume;

    if (!volumePerChain[networkId]) {
      volumePerChain[networkId] = {
        'blue-chip': {'wash-trade': 0, 'legit': 0}, 
        'non-blue-chip': {'wash-trade': 0, 'legit': 0},
      }
    }
    volumePerChain[networkId][blueChipKey]['wash-trade'] += washTradeVolume;
    volumePerChain[networkId][blueChipKey]['legit'] += legitVolume;

    if (!tradesPerTrader[trader]) {
      tradesPerTrader[trader] = [];
    }
    tradesPerTrader[trader].push({
      networkId,
      timestamp: trade.block_timestamp,
      baseToken: baseTokenName,
      quoteToken: quoteToken.name,
      baseTokenAmount,
      baseTokenDecimals,
      quoteTokenAmount,
      quoteTokenDecimals: quoteToken.decimals,
      legitVolume,
      washTradeVolume,
      isWashTrade
    });
  }

  const hftPerTrader = {};

  for (const trader in volumePerTrader) {
    const sumVolume = (networkVolume, volKey) => Object.keys(networkVolume)
      .map(k => networkVolume[k]['blue-chip'][volKey] + networkVolume[k]['non-blue-chip'][volKey])
      .reduce((sum, v) => sum + v, 0);

    const legitVolume = sumVolume(volumePerTrader[trader], 'legit')
    const washVolume = sumVolume(volumePerTrader[trader], 'wash-trade')
    totalVolumePerTrader[trader] = {
      'legit': legitVolume,
      'wash-trade': washVolume,
    }
  }

  for (const networkIdStr in volumePerChain) {
    const networkId = Number(networkIdStr);
    const keys = ['blue-chip', 'non-blue-chip'];
    for (const key of keys) {
      const networkWeight = chainWeight[networkId];
      const blueChipWeight = key === 'blue-chip' ? 0.75 : 0.25;
      const categoryHFT = numberHFT * networkWeight * blueChipWeight;

      const computeYield = (volume) => new BigNumber(1)
        .dividedBy(new BigNumber(1).plus(volume))
        .multipliedBy(categoryHFT)
        .multipliedBy(hftPrice)
        .multipliedBy(100);

      const volumeLegit = volumePerChain[networkId][key]['legit']
      const volumeOld = volumePerChain[networkId][key]['wash-trade'] + volumeLegit
      const hftLegitYield = computeYield(volumeLegit);
      const hftWashIncYield = computeYield(volumeOld);

      console.log(networkId, `${key} (old) Yield: ${hftWashIncYield.toFixed(4)}, Vol: ${toLocaleRounded(volumeOld)}`);
      console.log(networkId, `${key} (legit) Yield: ${hftLegitYield.toFixed(4)} Vol: ${toLocaleRounded(volumeLegit)}`); 

      for (const trader in volumePerTrader) {
        if (
          volumePerTrader[trader][networkId] 
          && volumePerTrader[trader][networkId][key] 
        ) {
          const traderVolumeLegit = volumePerTrader[trader][networkId][key]['legit'] ?? 0;
          const traderVolumeInclWash = traderVolumeLegit + volumePerTrader[trader][networkId][key]['wash-trade'] ?? 0;

          const chainVolumeLegit = volumePerChain[networkId][key]['legit'] ?? 0;
          const chainVolumeInclWash = chainVolumeLegit + volumePerChain[networkId][key]['wash-trade'] ?? 0;

          const computeTraderScore = (tVol, cVol) => tVol > 0 && cVol > 0 
            ? new BigNumber(tVol).dividedBy(cVol).multipliedBy(categoryHFT)
            : new BigNumber(0);

          const traderScoreLegit = computeTraderScore(traderVolumeLegit, chainVolumeLegit);
          const traderScoreInclWash = computeTraderScore(traderVolumeInclWash, chainVolumeInclWash)

          const traderHft = hftPerTrader[trader] ?? {}
          hftPerTrader[trader] = {
            'wash-trade-incl': traderScoreInclWash.plus(traderHft['wash-trade-incl'] ?? new BigNumber(0)),
            'legit': traderScoreLegit.plus(traderHft['legit'] ?? new BigNumber(0)),
          }
        }
      }
    }
  }

  const sumTotalVolume = (volKey) => Object.keys(totalVolumePerTrader)
    .reduce((sum, k) => sum + totalVolumePerTrader[k][volKey], 0);
  const totalVolumeLegit = toLocaleRounded(sumTotalVolume('legit'));
  const totalVolumeWash = toLocaleRounded(sumTotalVolume('wash-trade'));
  console.log(`\n\nTotal volume: $${totalVolumeLegit} L, $${totalVolumeWash} W`)

  const scoreFuncOld = (entry) => entry['wash-trade-incl'];
  const scoreFuncNew = (entry) => entry['legit'];
  const topTradersOld = getTopTraders(hftPerTrader, scoreFuncOld, 99);
  const topTradersNew = getTopTraders(hftPerTrader, scoreFuncNew, 99);

  const indexToStr = n => n < 9 ? `0${n + 1}` : `${n + 1}`;
  console.log(`\n\nNew ranking`);
  for (let k = 0; k < topTradersNew.length; k++) {
    const topTrader = topTradersNew[k];
    const addrStr = topTrader.slice(0, 6) + '...' + topTrader.slice(topTrader.length - 4)
    const legitVol = toLocaleRounded(totalVolumePerTrader[topTrader]['legit']);
    const washVol = toLocaleRounded(totalVolumePerTrader[topTrader]['wash-trade']);
    const hft = scoreFuncNew(hftPerTrader[topTrader]);
    const hftOld = scoreFuncOld(hftPerTrader[topTrader]);
    const hftOrder = Math.floor(Math.log10(hft.toNumber()) + 0.000000001);
    const hftStr = `${hft.toFixed(2)} HFT${' '.repeat(Math.max(4 - hftOrder, 0))}`;
    const hftDiff = hft.minus(hftOld);
    const diffSign = (hftDiff >= 0 ? '+' : '-');
    const absDiff = hftDiff.abs();
    const percentDiff = hftDiff.abs().dividedBy(hftOld).multipliedBy(new BigNumber(100));
    let diffStr = `${diffSign} ${absDiff.toFixed(2)} HFT, ${diffSign} ${percentDiff.toFixed(2)}%`
    const oldIndex = topTradersOld.indexOf(topTrader);
    const oldIndexStr = oldIndex === -1 ? '--' : indexToStr(oldIndex);
    console.log(`${indexToStr(k)} [${oldIndexStr}]: ${addrStr},  Vol: ($${legitVol} L, $${washVol} W)\t${hftStr} (${diffStr})`);
  }

  console.log(`\n\nTrades for top traders`);
  for (let l = 0; l < 2; l++) {
    const topTrader = topTradersNew[l]; 
    const bestTrades = tradesPerTrader[topTrader] 
    const legitVolume = toLocaleRounded(totalVolumePerTrader[topTrader]['legit'])
    const washVolume = toLocaleRounded(totalVolumePerTrader[topTrader]['wash-trade'])

    const bestTradesStr = bestTrades.map(trade => {
      const volStr = toLocaleRounded(trade.legitVolume);
      const volWashStr = toLocaleRounded(trade.washTradeVolume);
      const washStr = trade.isWashTrade ? 'W' : 'L';
      const networkStr = NETWORK_ID_NAME_MAP[trade.networkId];
      const baseAmount = toLocaleRounded(trade.baseTokenAmount.dividedBy(new BigNumber(10).pow(trade.baseTokenDecimals)))
      const quoteAmount = toLocaleRounded(trade.quoteTokenAmount.dividedBy(new BigNumber(10).pow(trade.quoteTokenDecimals)))
      return `[${washStr}] ${trade.timestamp} ${networkStr}: $${volStr} Legit, $${volWashStr} Wash - ${baseAmount} ${trade.baseToken} for ${quoteAmount} ${trade.quoteToken}`
    }).join('\n    ');
    console.log(`${indexToStr(l)}: ${topTrader} - Total volume: $${legitVolume} Legit, $${washVolume} Wash \n    ${bestTradesStr}\n`);
  }

  console.log(`\n\n\n`);
  conn.end();

  const data = [
    {
      x: [...Array(topTradersNew.length).keys()],
      y: topTradersNew.map(trader => scoreFuncNew(hftPerTrader[trader])),
      type: 'bar',
      name: 'New',
    },
    {
      x: [...Array(topTradersOld.length).keys()],
      y: topTradersOld.map(trader => scoreFuncOld(hftPerTrader[trader])), 
      type: 'bar',
      name: 'Old',
    }
  ]

  const x = [...Array(topTradersOld.length).keys()];
  const y = topTradersOld.map(trader => {
    const hft = scoreFuncNew(hftPerTrader[trader]);
    const hftOld = scoreFuncOld(hftPerTrader[trader]);
    const hftDiff = hft.minus(hftOld);
    const percentDiff = hftDiff.dividedBy(hftOld).multipliedBy(new BigNumber(100));
    return [hftDiff.toNumber(), percentDiff.toNumber()];
  });
 
  plot([{
    x, 
    y: y.map(entry => entry[0]),
    type: 'bar',
  }])
  //axs[1].plot(x, y.map(entry => entry[1]));

  //axs[0].set_title('HFT Absolute Change');
 // axs[1].set_title('HFT Percentage Change');
}

function toLocaleRounded(n) { 
  return n.toLocaleString(undefined, {maximumFractionDigits: 2, minimumFractionDigits: 2});
}

async function getPostgresConnection() {
  const pg = require('pg');
  const { Client } = pg;
  pg.types.setTypeParser(1114, str => str);
  pg.defaults.parseInputDatesAsUTC = true;
  const client = new Client({
    user: 'hashflow',
    database: 'hashflow',
    host: 'hashdb.cluster-cm2lz3klpv6z.us-east-1.rds.amazonaws.com',
    port: 5432,
    password: 'hznFxKNcoaGCVeijkuQdKPME',
  });
  await client.connect();
  return client;
}

function getTokenByName(tokens, networkId, name) {
  const token = tokens.find(t => t.network_id === networkId && t.name === name);
  if (!token) {
    throw new Error(`Could not find token ${networkId}:${name}`);
  }
  return token;
}

function withinTolerance (a, b, t) {
  return new BigNumber(1)
    .minus(new BigNumber(a).dividedBy(new BigNumber(b)))
    .abs()
    .lte(new BigNumber(t));
}


function tradeIsWashTrade(index, trades) {
  const trade = trades[index];
  for(let j=index-1; j >= 0 && j >+ index - 10; j--) {
    const prevTrade = trades[j];
    if (
      trade.base_token_name === prevTrade.quote_token_name 
      && trade.quote_token_name === prevTrade.base_token_name
      && withinTolerance(trade.base_token_amount, prevTrade.quote_token_amount, 0.01)
      && withinTolerance(trade.quote_token_amount, prevTrade.base_token_amount, 0.01)
    ) return true;
  }
  
  return false;
}

function getTopTraders(hftPerTrader, scoreFunc, num) {
  const allTraders = Object.keys(hftPerTrader);
  allTraders.sort(
    (t1, t2) => scoreFunc(hftPerTrader[t2]).minus(scoreFunc(hftPerTrader[t1])).toNumber()
  );
  return allTraders.slice(0, num);
}

tradingStats()