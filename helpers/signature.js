
const { utils, Wallet } = require('ethers');
const { ecsign } = require('ethereumjs-util');

// TODO: Add EOA (if using EOA)
const EOA = undefined;

// TODO: Add correct pool
const POOL = '0x123456789abcdef0123456789abcdef012345678';

// TODO: Replace with private key –– avoid putting here in plaintext for security reasons
const PRIVATE_KEY = '0xabcdef0123456789'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function signQuote(quoteData) {
  const hash = utils.solidityKeccak256(
    [
      'address',
      'address',
      'address',
      'address',
      'address',
      'address',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
      'bytes32',
      'uint256',
    ],
    [
      quoteData.pool,
      quoteData.trader,
      quoteData.effectiveTrader ?? quoteData.trader,
      quoteData.eoa ?? ZERO_ADDRESS,
      quoteData.baseToken,
      quoteData.quoteToken,
      quoteData.baseTokenAmount,
      quoteData.quoteTokenAmount,
      quoteData.nonce,
      quoteData.quoteExpiry,
      quoteData.txid,
      1,  // Chain ID
    ]
  );

  const signer = new Wallet(PRIVATE_KEY);
  return await signer.signMessage(Buffer.from(stripHexPrefix(hash), 'hex'));
}

function stripHexPrefix(str) {
  return str.slice(0, 2) === '0x' ? str.slice(2) : str;
}

module.exports = {EOA, POOL, signQuote};