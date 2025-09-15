import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { routeWsMessage } from './wsRouter.js';
import type { MyWebSocket, WsMessage } from '@ws/types/index.js';
import { handleDisconnect } from './services/transport/BroadcasterLobby.js';
import logger from '@logger';

export const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: MyWebSocket) => {
    logger.info('✅ New WS connection');

    ws.on('message', (raw: string) => {
      let data: WsMessage;
      try {
        data = JSON.parse(raw.toString());
      } catch (err) {
        logger.warn('❌ Invalid WS message received', { raw, error: err });
        return;
      }

      try {
        routeWsMessage(ws, wss, data);
      } catch (err) {
        logger.error('❌ Error handling WS message', { data, error: err });
      }
    });

    ws.on('close', () => {
      logger.info(`❌ WS disconnected: ${ws.nick || 'unknown nick'}`);
      handleDisconnect(ws, wss);
    });

    ws.on('error', (err) => {
      logger.error('❌ WS error', { error: err, nick: ws.nick });
    });
  });

  logger.info('🌐 WebSocket server initialized at /ws');

  return wss;
};
