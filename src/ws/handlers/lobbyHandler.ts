import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import * as LobbyHandlers from './lobby/index.js';
import { validateMessage } from '@utils/wsValidators.js';
import { LobbyInput, LobbySchemas } from '@utils/validator/lobby.validator.js';
import logger from '@logger';

type LobbyHandler<T = any> = (ws: MyWebSocket, wss: Server, msg: T) => void | Promise<void>;

const lobbyHandlerMap: Record<string, LobbyHandler> = {
  create_lobby: LobbyHandlers.handleCreateLobby as LobbyHandler,
  join_lobby: LobbyHandlers.handleJoinLobby as LobbyHandler,
  leave_lobby: LobbyHandlers.handleLeaveLobby as LobbyHandler,
  ping_lobbies: LobbyHandlers.handlePingLobbies as LobbyHandler,
};

// --- Router ---
export const routeLobbyMessage = async (ws: MyWebSocket, wss: Server, msg: LobbyMessage) => {
  logger.debug('[lobbyHandler] Incoming message', { type: msg.type, nick: ws.nick, msg });

  if (!msg.type) {
    logger.warn('[lobbyHandler] Missing message type', { msg });
    ws.send(JSON.stringify({ type: 'error', message: 'Missing message type' }));
    return;
  }

  const handler = lobbyHandlerMap[msg.type];
  if (!handler) {
    logger.warn(`[lobbyHandler] Unknown lobby message type: ${msg.type}`, { msg });
    ws.send(JSON.stringify({ type: 'error', message: `Unknown lobby type: ${msg.type}` }));
    return;
  }

  logger.debug(`[lobbyHandler] Found handler for type: ${msg.type}`, { handlerName: handler.name });

  // ✅ Walidacja i typowanie
 const validated = validateMessage<LobbyInput>(ws, msg, LobbySchemas);
if (!validated) return;

  try {
    // ✅ Przekazujemy validated zamiast msg – TS wie, że ma wszystkie pola
    await handler(ws, wss, validated);
    logger.debug(`[lobbyHandler] Handler executed successfully for type: ${msg.type}`, { nick: ws.nick });
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
    logger.error(`[LOBBY_HANDLER_ERROR] ${msg.type} from ${ws.nick}`, err);
  }
};
