import { MyWebSocket, WsMessage } from '@types';
import { Server } from 'ws';
import logger from '../../utils/logger.js';
import {
  handleSubscribeToGame,
  handleLeaveGame,
  handlePlayerReady,
  handleRestartGame,
  handleStartGame,
  handlePlayerAction,
} from './game/index.js';
import { dataStore } from '@ws/data/data.js';

export const handleGameMessage = async (
  ws: MyWebSocket,
  wss: Server,
  msg: WsMessage,
) => {
  if (!msg.lobbyId || !ws.nick) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  const game = dataStore.getGames()[msg.lobbyId];
  if (!game && msg.type !== 'start_game' && msg.type !== 'subscribe_to_game') {
    ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
    return;
  }

  logger.info(`[GAME_MESSAGE] Type: ${msg.type}, from: ${ws.nick}, lobbyId: ${msg.lobbyId}`);

  await dataStore.withLock(async () => {
    switch (msg.type) {
      case 'start_game':
        handleStartGame(ws, wss, msg);
        break;
      case 'subscribe_to_game':
        handleSubscribeToGame(ws, msg);
        break;
      case 'player_ready':
        handlePlayerReady(ws, wss, msg);
        break;
      case 'restart_game':
        handleRestartGame(ws, wss, msg);
        break;
      case 'player_action':
        handlePlayerAction(ws, wss, msg, game);
        break;
      case 'leave_game':
        handleLeaveGame(ws, wss, msg);
        break;
      default:
        logger.warn(`[GAME_MESSAGE] Unhandled message type: ${msg.type} from ${ws.nick}`);
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  });
};