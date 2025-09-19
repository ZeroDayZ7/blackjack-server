// wsRouter.ts
import type { WebSocketServer } from 'ws';
import type { GameMessage, LobbyMessage, MyWebSocket, WsMessage } from './types/index.js';
import { routeLobbyMessage } from './handlers/lobbyHandler.js';
import { routeGameMessage } from './handlers/gameHandler.js';
import logger from '@logger';

export function routeWsMessage(ws: MyWebSocket, wss: WebSocketServer, data: WsMessage) {
  switch (data.type) {
    case 'create_lobby':
    case 'join_lobby':
    case 'leave_lobby':
    case 'ping_lobbies':
      return routeLobbyMessage(ws, wss, data as LobbyMessage);
    case 'start_game':
    case 'player_action':
    case 'subscribe_to_game':
    case 'restart_game':
    case 'player_ready':
    case 'leave_game':
      return routeGameMessage(ws, wss, data as GameMessage);
    default:
      logger.warn('❌ [wsRouter] Unknown WS message type:', data);
  }
}
 