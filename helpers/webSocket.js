const WebSocket = require('ws');
const dotenv = require('dotenv');
dotenv.config();

const PING_PONG_INTERVAL_MS = 30000;
const PING_PONG_GRACE_PERIOD_MS = 1000;

function getWebsocketConnection(
  marketMakerName,
  onMessageCallBack,
  onCloseCallback,
  onHeartbeatCallback,
) {
  const ws = new WebSocket(`${process.env.HASHFLOW_WS_API}/maker/v1`, {
    headers: { marketmaker: marketMakerName, }
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

  ws.on('unexpected-response', (_, res) => {
    let message = '';
    res.on('data', (chunk) => {
      message += chunk;
    });
    res.on('end', () => {
      if (res.statusCode === 401) {
        logger.error(`WS access not authorized. ${message}`);
      } else {
        logger.error(`Unexpexted response from server: [${res.statusCode}] ${message}.`);
      }
      ws.close()
    });
  });

  return ws;
}

export function sendMessage(ws, messageType, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ messageType, message }));
  }
}