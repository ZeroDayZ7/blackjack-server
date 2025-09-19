import type { Server } from 'ws';
import type { GameMessage, MyWebSocket } from '@types';
import { dataStore } from '@ws/data/data.js';
import * as Handlers from './game/index.js';
import { validateMessage } from '@utils/wsValidators.js';
import { GameSchemas } from '@utils/validator/index.js';

// --- Typ handlera z generics ---
type Handler<T extends GameMessage = GameMessage> = (
  ws: MyWebSocket,
  wss: Server,
  msg: T,
  game?: any,
) => void | Promise<void>;

// --- Mapa handlerów ---
const gameHandlerMap: Record<string, Handler> = {
  start_game: Handlers.handleStartGame as Handler,
  subscribe_to_game: Handlers.handleSubscribeToGame as Handler,
  player_ready: Handlers.handlePlayerReady as Handler,
  restart_game: Handlers.handleRestartGame as Handler,
  player_action: Handlers.handlePlayerAction as Handler,
  leave_game: Handlers.handleLeaveGame as Handler,
};

// --- Router ---
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

  // ✅ Walidacja i typowanie
  const validated = validateMessage(ws, msg, GameSchemas);
  if (!validated) return;

  // Pobieramy instancję gry
  const game = validated.lobbyId ? dataStore.getGames()[validated.lobbyId] : undefined;

  try {
    // ✅ Przekazujemy validated zamiast msg – TS widzi pełne pola
    await handler(ws, wss, validated, game);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
    console.error(`[GAME_HANDLER_ERROR] ${msg.type} from ${ws.nick}`, err);
  }
};
