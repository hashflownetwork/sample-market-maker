
const { utils } = require('ethers');
const { ecsign } = require('ethereumjs-util');

// TODO: Add EOA (if using EOA)
const EOA = undefined;

// TODO: Add correct pool
const POOL = '0x123456789abcdef0123456789abcdef012345678';

// TODO: Replace with private key –– avoid putting here in plaintext for security reasons
const PRIVATE_KEY = '0xabcdef0123456789'

function signQuote(quoteData) {
  const kValueOrNonce = quoteData.kValue || quoteData.nonce;
  const fields = [
    "address", 
    "address", 
    "address",
    EOA && "address", 
    "address", 
    "address", 
    "uint256", 
    "uint256", 
    "uint256", 
    "uint256", 
    "uint8",
    "uint256", 
    "bytes32"
  ];

  const values = [
    quoteData.pool,
    quoteData.trader,
    quoteData.effectiveTrader ?? quoteData.trader,
    EOA && quoteData.eoa,
    quoteData.baseToken,
    quoteData.quoteToken,
    quoteData.baseTokenAmount.toFixed(),
    quoteData.quoteTokenAmount.toFixed(),
    quoteData.fees.toFixed(),
    kValueOrNonce,
    quoteData.flag,
    quoteData.quoteExpiry,
    quoteData.txid
  ]

  const quoteHash = utils.solidityKeccak256(fields, values);
  const { v, r, s } = ecsign(hexToBuf(quoteHash), hexToBuf(PRIVATE_KEY));
  return concatRSV(r, s, v);
}

function hexToBuf(value) {
  const padToEven = a => (a.length % 2) ?  `0${a}` : a;
  return Buffer.from(padToEven(stripHexPrefix(v)), 'hex');
}

function concatRSV(r, s, v) {
  return (
    '0x' +
    stripHexPrefix('0x' + r.toString('hex')) +
    stripHexPrefix('0x' + s.toString('hex')) +
    stripHexPrefix(v.toString(16))
  );
}

function stripHexPrefix(str) {
  return str.slice(0, 2) === '0x' ? str.slice(2) : str;
}

module.exports = {EOA, POOL, signQuote};