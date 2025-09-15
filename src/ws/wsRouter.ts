// wsRouter.ts
import type { WebSocketServer } from 'ws';
import type { MyWebSocket, WsMessage } from './types/index.js';
import { routeLobbyMessage } from './handlers/lobbyHandler.js';
import { routeGameMessage } from './handlers/gameHandler.js';

export function routeWsMessage(ws: MyWebSocket, wss: WebSocketServer, data: WsMessage) {
  switch (data.type) {
    case 'create_lobby':
    case 'join_lobby':
    case 'leave_lobby':
    case 'ping_lobbies':
      return routeLobbyMessage(ws, wss, data);
    case 'start_game':
    case 'player_action':
    case 'subscribe_to_game':
    case 'restart_game':
    case 'player_ready':
      return routeGameMessage(ws, wss, data);
    default:
      console.warn('❌ Unknown WS message type:', data.type);
  }
}
