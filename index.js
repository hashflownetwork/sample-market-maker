const { processMessage, publishPriceLevels } = require('./messages');
const { getWebsocketConnection, sendMessage } = require('./helpers/webSocket');
const { SUPPORTED_PAIRS } = require('./pricing');
const { POOL } = require('./helpers/signature');


// TODO: Replace this with your market maker name (once added to the backend)
const MARKET_MAKER_NAME = 'TestMM';

// TODO: Set true if you want to MM on 1inch, etc – and have signed legal agreements
const SUPPORT_AGGREGATORS = false;

const levelsInterval = SUPPORT_AGGREGATORS 
  ? setInterval(() => publishPriceLevels(mainSocket), 1000)
  : undefined;

const onMessageCallback = message => processMessage(mainSocket, message);
const onHeartbeatCallback = () => {
  for (const networkId of Object.keys(SUPPORTED_PAIRS)) {
    sendMessage(mainSocket, 'subscribeToTrades', { networkId, pool: POOL });
  }
};
const onCloseCallback = () => {
  if (SUPPORT_AGGREGATORS) {
    clearInterval(levelsInterval);
  }

  mainSocket = connectToHashflow();
};


const connectToHashflow = () => {
  return getWebsocketConnection(
    MARKET_MAKER_NAME,
    onMessageCallback,
    onCloseCallback,
    onHeartbeatCallback,
  );
}

let mainSocket = connectToHashflow();
