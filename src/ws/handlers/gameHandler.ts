import type { Server } from 'ws';
import type { GameMessage, MyWebSocket } from '@types';
import { dataStore } from '@ws/data/data.js';
import * as Handlers from './game/index.js'; // import wszystkich handlerów

const gameHandlerMap: Record<
  string,
  (ws: MyWebSocket, wss: Server, msg: GameMessage, game?: any) => void | Promise<void>
> = {
  start_game: Handlers.handleStartGame,
  subscribe_to_game: Handlers.handleSubscribeToGame,
  player_ready: Handlers.handlePlayerReady,
  restart_game: Handlers.handleRestartGame,
  player_action: Handlers.handlePlayerAction,
  leave_game: Handlers.handleLeaveGame,
};

export const routeGameMessage = async (ws: MyWebSocket, wss: Server, msg: GameMessage) => {
  if (!msg.type) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing message type' }));
    return;
  }

  const handler = gameHandlerMap[msg.type];
  if (!handler) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    return;
  }

  // const game = msg.lobbyId ? (await import('@ws/data/data.js')).dataStore.getGames()[msg.lobbyId] : undefined;
  const game = msg.lobbyId ? dataStore.getGames()[msg.lobbyId] : undefined;

  try {
    await handler(ws, wss, msg, game);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
    console.error(`[GAME_HANDLER_ERROR] ${msg.type} from ${ws.nick}`, err);
  }
};
