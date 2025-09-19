import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobbyUpdate, broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import logger from '@logger';
import { validateMessage } from '@utils/wsValidators.js';
import { LeaveLobbyInput, LobbySchemas } from '@utils/validator/lobby.validator.js';

/**
 * Handle player leaving a lobby
 */
export async function handleLeaveLobby(ws: MyWebSocket, wss: Server, msg: LeaveLobbyInput) {

 const { lobbyId, nick } = msg;

  const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
  if (!lobby) {
    logger.info(
      `[LEAVE_LOBBY] Lobby ${lobbyId} not found, still confirming leave for ${nick}`,
    );
    ws.send(JSON.stringify({ type: 'left_lobby', lobbyId: lobbyId, nick: nick }));
    return;
  }

  // Usuń gracza
  lobby.players = lobby.players.filter((p) => p !== nick);

  // Jeśli odszedł host, wybierz nowego
  if (lobby.host === nick) {
    const humanPlayers = lobby.players.filter((p) => !p.startsWith('Bot'));
    lobby.host = humanPlayers[0] || null;
  }

  // Jeśli lobby puste, usuń
  if (lobby.players.length === 0) {
    dataStore.removeLobby(lobby.id);
    logger.info(`[LEAVE_LOBBY] Lobby ${lobby.id} removed`);
  } else {
    // Broadcast stanu lobby
    broadcastLobbyUpdate(wss, lobby);
  }

  // Potwierdzenie dla wychodzącego gracza
  ws.send(JSON.stringify({ type: 'left_lobby', lobbyId: lobby.id, nick: nick }));

  // Zaktualizuj listę wszystkich lobby
  broadcastLobbyList(wss);
}
