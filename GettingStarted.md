# **Market** Making: Getting Started

So you want to market make on Hashflow? Awesome! This doc will walk you through the steps of integrating with Hashflow so that you can start offering quotes and making trades.

### 1. Connect to WebSocket

Check out [this example repo](https://github.com/hashflownetwork/sample-market-maker/) which contains example files showing how to connect to our Websocket. These files are only illustrative example. You can implement your 

A few things to note here:

1. This example uses `'TestMM'` as the market maker for connecting. On the WebSocket side, we only permit allowlisted Makers. Reach out to us **[TODO: Contact Point]** with your market maker name and we'll add it to the allowlist. After that, replace `'TestMM'` with your market maker. The Test MM is only used for testing (not permitted in Prod) and will be used by anyone else setting up their MM service. 
2. Our WebSocket validates connections based on the `marketmaker` field provided. We support authenticating based on internal keys AND/OR by allowlisted IP address. Contact us **[TODO: Contact Point]** to share how you'd like your market to be verified and what key and/or IP to check for.
3. The `marketmaker` field needs to be an exact (capitalization) match. If we allowlist `'MyMarketMaker'` and you try connecting with `'mymarketmaker'`, our WebSocket will reject the request. For this reason, we use **CamelCase** notation for our MM names. Acronyms should still be capitalized (so `'ABCMaker'` instead of `AbcMaker`)



### 2. Test the Connection

Once connected, you can test your Market Maker by sending the following request to our staging API:

```reStructuredText
POST https://api-staging.hashflow.com/taker/v1/quote/rfq
```



Use these body params:

```json
{
    "networkId": 42,  // 42 is Kovan, 1 is Mainnet
    "source": "hashflow", 
    "baseToken": "0x07de306ff27a2b630b1141956844eb1552b956b5",  // USDT (Kovan)
    "quoteToken": "0xa0a5ad2296b38bd3e3eb59aaeaf1589e8d9a29a9",  // WBTC (Kovan)
    "trader": "0x2150DD462B496bd5e4A37b5411c13319427BE83E",
    "baseTokenAmount": "1000000",
    "marketMaker": "mmXYZ"  // Obscured MM
}
```



If everything works correctly, you should receive a message from the WebSocket.



**NOTE**: The `marketMaker` field here is the "obscured" market maker. This is NOT the same field as the `marketmaker` you specify when connecting. We have an internal mapping so that we don't expose market maker identities. In this case, `mmXYZ <> TestMM`. Please ask us what your obscured MM name is.



### 3. Create a Pool

Now that you've connected to the WebServer, you'll need a Pool to offer quotes. Navigate to Hashflow -> ["My Pools"](https://app.hashflow.com/pools/my) and follow the instructions there to create a pool. 

You'll have to fill in three fields:

1. **Pool/Token Name**: The name you'd like to give your pool.
2. **Signer Address**: The key you'll use to sign quotes off-chain for your market maker. Put the public key (address) here and ensure the private key is stored securely. You'll need to be able to programatically sign quotes with the private key later on (in the `signQuote` API). Make sure this key is not in cold storage.
3. **Public Pool**: Whether you want your pool to be public (LPs can add liquidity) or private. Public pools can be either permissioned (only allowed addresses can contribute) or open. Keep in mind public pools are eligible for additional HFT tokens based on their performance (see [HFT tokenomics](hashflow.com/token)).



After submitting the transaction, your new pool will be created. You should then see something like:

![Screen Shot 2022-01-21 at 10.39.14 PM](/Users/michael/Library/Application Support/typora-user-images/Screen Shot 2022-01-21 at 10.39.14 PM.png)



If you've created a private pool, you have two options for how to fund market making:

1. **EOA (*externally owned account*)**. You can use an external account to fund market making out of your pool. For this, you need to specify the ``eoa`` field when sending quotes (see API below). The advantage of EOA trading is that it supports native `ETH` (instead of `WETH`) and that it has lower gas fees (since no wrapping/unwrapping is required).
2. **Pool Funds**. You can also use pool funds to market make. You can add funds to your pool using the *Deposit* function. Market making from hashflow will come out of the pool balance if not EOA is specified. The advantage of using pool funds is that it allows you to leverage LP funds for market making.

For public pools, you need to use (2) pool funds since EOA is not supported.



### 4. Receive RFQ and Respond with Quote

The request above sends an RFQ (request-for-quote) to our server. The server then relays this to the specified market maker (or all market makers, if none is specified) as a WebSocket message with format:

```json
{
  "messageType": "rfq",
  "message": {
    // This is a unique RFQ ID -- you need to use this when sending back a quote.
    "rfqId": string,

    // This will be something like: hashflow, 1inch. This is useful
    // since 1inch charge fees for their trades
    "source": string,

    // 1 for ETH L1
    "networkId": number,

    // Base token (the token the trader sells).
    "baseToken": string,  // contract address
    "baseTokenName": string,  // token name (e.g. USDC, ETH, ...)
    "baseTokenNumDecimals": number,  // token decimals (e.g. DAI: 18, USDC: 6)

    // Quote token (the token the trader buys).
    "quoteToken": string,  // contract address
    "quoteTokenName": string,  // token name (e.g. USDC, ETH, ...)
    "quoteTokenNumDecimals": number,  // token decimals (e.g. DAI: 18, USDC: 6)


    // Exactly one of the following fields will be present in the RFQ.
    // If baseTokenAmount is present, quoteTokenAmount needs to be filled by the quote.
    // If quoteTokenAmount is present, baseTokenAmount needs to be filled by the quore.
    // Amounts are in decimals, e.g. "1000000" for 1 USDT.
    "baseTokenAmount": ?string,
    "quoteTokenAmount": ?string,

    // The trader wallet address that will swap with the contract. This can be a proxy
    // contract (e.g. 1inch)
    "trader": string,

    // The wallet address of the actual trader (e.g. end user wallet for 1inch).
    // This is helpful in order to understand user behavior.
    // If effectiveTrader is not present, you can assume that trader == effectiveTrader.
    "effectiveTrader": ?string,
  }
}

```



After receiving this RFQ message, compute the quote you'd like to offer (based on market conditions, internal balances, etc) and – if you'd like to quote – return that quote in the following format:

```json
{
  "messageType": "quote",
  "message": {
    "rfqId": string,  // This should be the same rfqId that was sent by the server
    "pool": string,  // This should be the contract address of the pool.
    
    // This is optional. If using an EOA (externally owned account), this should 
    // contain the wallet address of the EOA. 
    // The EOA needs to have allowance set to the Pool.
    "eoa": ?string,
    
    // Same as RFQ
    "baseToken": string,
    "quoteToken": string,
    
    // Amounts are in decimals.
    "baseTokenAmount": string,
    "quoteTokenAmount": string,

    // Set this to "0" for private pool / EOA trading.
    "fees": string,

    // The unix timestamp when the quote expires, in seconds.
    "quoteExpiry": number,
  }
}
```



The Hashflow server will wait **[TODO] X seconds** for a quote before timing out. If no `marketMaker` is specified, we request a quote from all connected MMs, wait **[TODO] X seconds** for a response and return the best quote.



### 5. Support Signing Quotes

If the user accepts the quote, they will send a request to 

```
POST https://api-staging.hashflow.com/taker/v1/quote/sign
```



which the server will forward to the MM over the WebSocket with the following format:

```json

  "messageType": "signQuote",
  "message": {
    // The RFQ ID that generated the quote.
    "rfqId": string,
    "quoteData": {
      "txid": string,  // Unique identifier of the quote -- different from the RFQ ID.
 
      "pool": string,
      "eoa": ?string,  // EOA address if using EOA
    
      "baseToken": string,
      "quoteToken": string,
      
      "baseTokenAmount": string,
      "quoteTokenAmount": string,

      "fees": string,

      "quoteExpiry": number,

      // The account that will be executing the swap. For 1inch, this is the 1inch proxy.
      "trader": string,
      // Trader actually executing the swap, if different from 'trader'.
      "effectiveTrader": ?string,

      // The following parameters are internal to hashflow contracts. 
      // Exactly one of "kValue" and "nonce" will be present.
      "kValue": ?number,
      "nonce": ?number,
      "flag": number,
    }
  }
}
```



The MM should then produce an ethereum signature of the quote hash. The signature logic depends on whether you are market making through an **EOA** or **pool funds**.

 See this example JavaScript for **how to sign if you're using EOA**:

```javascript
const { utils } = require('ethers');
const { ecsign } = require('ethereumjs-util');

const kValueOrNonce = quoteData.kValue || quoteData.nonce;

const quoteHash = utils.solidityKeccak256(
  ["address", "address", "address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
  [
    quoteData.pool,
    quoteData.trader,
    quoteData.eoa,
    quoteData.baseToken,
    quoteData.quoteToken,
    quoteData.baseTokenAmount.toFixed(),
    quoteData.quoteTokenAmount.toFixed(),
    quoteData.fees.toFixed(),
    kValueOrNonce,
    quoteData.quoteExpiry,
    quoteData.txid
  ]
);

const { v, r, s } = ecsign(this.hexToBuf(message), this.hexToBuf(signerPrivKey));
const signature = this.concatRSV(r, s, v);
```



And this example JavaScript for **how to sign if you're using pool funds**:

```js
const { utils } = require('ethers');
const { ecsign } = require('ethereumjs-util');

const kValueOrNonce = quoteData.kValue || quoteData.nonce;

const quoteHash = utils.solidityKeccak256(
  ["address", "address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
  [
    quoteData.pool,
    quoteData.trader,
    quoteData.baseToken,
    quoteData.quoteToken,
    quoteData.baseTokenAmount.toFixed(),
    quoteData.quoteTokenAmount.toFixed(),
    quoteData.fees.toFixed(),
    kValueOrNonce,
    quoteData.quoteExpiry,
    quoteData.txid
  ]
);

const { v, r, s } = ecsign(this.hexToBuf(message), this.hexToBuf(signerPrivKey));
const signature = this.concatRSV(r, s, v);
```



For both examples, the helper functions have been omitted for simplicity. Again, you're not required to use javascript –– this is simply what our examples use.



**NOTE**: The **public key** (address) associated with the **private key** that is used for signing has to be used when creating the hashflow pool. If using an EOA, set allowance to the Private Pool so that it can:

- verify signatures
- wrap / unwrap ETH
- orchestrate the swaps



The MM should then broadcast the signature back through the websocket:

```json
{
  "messageType": "signature",
  "message": {
    "txid": string,  // This is the quote txid previously sent.
    "signature": string
  }
}
```



The trader will then be able to take the signature and call Hashflows smart contract to execute the quote (within the expiry window).



##### Get Signed RFQ

The typical flow for a trade is: `POST /rfq` -> `Quote` -> `POST /sign` -> `Signature` -> `Execute Trade`. Since it can sometimes be cumbersome to make two requests, we've implemented an additional API to abstract some of this process: `/signedRfq`. This endpoint can be called at 

```reStructuredText
POST https://api-staging.hashflow.com/taker/v1/quote/signedRfq
```

with the same body parameters as `/rfq`. We then make an RFQ call over the WebSocket and another one to sign the selected quote and return a full quote (including signature) to the user. Since this uses the same WebSocket API, market makers don't have to implement any additional logic.



### 6. Support Pairs

In order for us to know which token trading pairs are supported by each MM, our backend queries the supported token pairs via the WebSocket:

```json
{
  "messageType": "getPairs",
  "message": {
    "networkId": number  // 1 for ETH L1
  }
}
```

  

The MM should then respond with the following message:

```json
{
  "messageType": "pairs",
  "message": {
    "networkId": number,
    "pairs": Array<{
      "baseTokenName": string,  // base token name (e.g. "ETH", "USDC")
      "quoteTokenName": string,  // quote token name (e.g. "ETH", "USDC")
    }>
  }
}
```



**NOTE:** Make sure to include both directions (e.g. `{ETH, USDC}, {USDC, ETH}`) if your MM supports them.



### 7. Support Price Levels

In order to power *1inch* APIs, the MM should send, for every supported pair, price levels, every second. These price levels represents indicative pricing  for each tuple. The format of these messages is:

```json
{ 
  "messageType": "priceLevels",
  "message": {
    "baseTokenName": string,  // e.g. ETH
    "quoteTokenName": string,  // e.g. USDT

    "levels": [
      {
        // string representation of the level e.g. (2.5 for 2.5 ETH)
        level: string,

        // string representation of the price per unit at that level 
        // (e.g. 3500 for "up to 2.5 ETH at 3500 USDT per ETH")
        // this price is not in decimals -- it's the actual exchange rate, 
        // in floating point notation
        price: string
      }
    ]
  }
}
```



Hashflow then caches these price levels for a max of **10 seconds** (or until new levels are published) and returns them to *1inch* when queried.



### 8. Execute your first Trade

  Finally, test your new market maker end-to-end. You'll want to start by making a request to `/rfq` and `/sign` (or directly `/signedRfq`) targeting your specific market maker. Make sure to use a test network (like Kovan) first to ensure everything works properly.

Once you have obtained a signed Quote, you can then execute the signed quote by calling the Hashflow `router` smart contract. 

The contract has the following addresses:

* Kovan (42): `0x63aE536fEC0b57bDeB1fD6a893191b4239F61bFF`
* Mainnet (1): `0x7E277614644409a69ea70Df5cfCB114E4a51676D`

and the following ABI:

```json
{
  "inputs": [{
    "components": [
      {
        "internalType": "address",
        "name": "pool",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "eoa",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "trader",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "effectiveTrader",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "baseToken",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "quoteToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "effectiveBaseTokenAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxBaseTokenAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxQuoteTokenAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "fees",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "quoteExpiry",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "kValueOrNonce",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "tradeEOA",
        "type": "bool"
      },
      {
        "internalType": "enum IQuote.Flag",
        "name": "flag",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "txid",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "signedQuote",
        "type": "bytes"
      }
    ],
    "internalType": "struct IQuote.Quote",
    "name": "quote",
    "type": "tuple"
  }],
  "name": "tradeSingleHop",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
},
```



Some clarification for the ABI fields:

*  **`tradeEOA`**. Boolean of whether it is an EOA trade. Set to "true" if you receive an `eoa` from the API.
* **`eoa`**. EOA address. Set to `eoa`, if set in your signed quote. Otherwise, use the `0x0` ETH address.
* **`maxBaseTokenAmount` / `maxQuoteTokenAmount`**. These are what you receive in the API as `baseTokenAmount` / `quoteTokenAmount`. Sometimes you can receive a quote for higher than what you requested. It is essential that you use the requested amount in the effectiveBaseTokenAmount field.
* **`effectiveBaseTokenAmount`** . The actual swapped amount. This has to be less than or equal to `maxBaseTokenAmount`. We suggest to keep them equal unless there's a discrepancy with the requested amount.



After submitting, go to etherscan and confirm your trade went through.



### 9. Success!!

Congrats! You've successfully set up a market maker 🥳