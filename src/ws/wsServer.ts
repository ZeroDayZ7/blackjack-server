// setupWebSocket.ts
import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { routeWsMessage } from './wsRouter.js';
import type { MyWebSocket, WsMessage } from '@ws/types/index.js';
import { handleDisconnect } from './utils/lobbyManager.js';

export const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: MyWebSocket) => {
    console.log('✅ New WS connection');

    ws.on('message', (raw: string) => {
      let data: WsMessage;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        console.warn('❌ Invalid WS message:', raw);
        return;
      }

      routeWsMessage(ws, wss, data);
    });

    ws.on('close', () => handleDisconnect(ws, wss));
  });

  return wss;
};
