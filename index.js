const { createLogger, format, transports } = require('winston');

const dotenv = require('dotenv');
dotenv.config();

const WebSocket = require('ws');

const PING_PONG_INTERVAL_MS = 30000;
const PING_PONG_GRACE_PERIOD_MS = 1000;

const LOG_LEVEL_INFO = 'info';

const logger = createLogger({
  level: LOG_LEVEL_INFO,
  transports: [
    new transports.Console({
      format: format.simple(), 
      handleExceptions: true
    })
  ],
});

function getWebsocketConnection(
  onMessageCallBack,
  onCloseCallback,
  onHeartbeatCallback,
) {
  const ws = new WebSocket(`${process.env.HASHFLOW_WS_API}/maker/v1`, {
    headers: {
      marketmaker: 'TestMM',
    }
  });
  const heartbeat = () => {
    logger.info('Websocket heartbeat.');
    if (ws.pingTimeout) {
      clearTimeout(ws.pingTimeout);
    }
    ws.pingTimeout = setTimeout(() => {
      ws.terminate();
    }, PING_PONG_INTERVAL_MS + PING_PONG_GRACE_PERIOD_MS);
    onHeartbeatCallback();
  }

  ws.on('open', heartbeat);
  ws.on('ping', heartbeat);
  ws.on('message', message => onMessageCallBack(message));
  ws.on('close', () => {
    logger.info('Websocket connection closed.');
    if (ws.pingTimeout) {
      clearTimeout(ws.pingTimeout);
    }
    setTimeout(() => {
      ws.removeAllListeners();
      onCloseCallback();
    }, 5000);
  });
  ws.on('error', err => {
    logger.error(`Websocket error: ${err.message}`);
  });

  return ws;
}

const onHeartbeatCallback = () => {};
const onCloseCallback = () => {
  mainSocket = connectToHashflow();
};

const onMessageCallback = message => {
  try {
    logger.info(`Received message: ${message.toString()}`);
    const decodedMessage = JSON.parse(message.toString());
    if (decodedMessage?.messageType === 'rfq') {
      const rfq = decodedMessage.message;
      // RFQ handling logic here.
      const apiQuote = {
        rfqId: rfq.rfqId,
        pool: '0xa85bfe2e2aeca4697a49b5ddee6d020d2177d809',
        baseToken: rfq.baseToken,
        quoteToken: rfq.quoteToken,
        baseTokenAmount: '1000000000',
        quoteTokenAmount: '1000000000',
        fees: '0',
        quoteExpiry: Math.floor(Date.now() / 1000) + 180,  // 3 minutes
      };
      if (mainSocket.readyState === WebSocket.OPEN) {
        mainSocket.send(JSON.stringify({
          messageType: 'quote',
          message: apiQuote,
        }));
      }
    }
  } catch (err) {
    logger.error(err.message);
  }
};

const connectToHashflow = () => {
  return getWebsocketConnection(
    onMessageCallback,
    onCloseCallback,
    onHeartbeatCallback,
  );
}

let mainSocket = connectToHashflow();