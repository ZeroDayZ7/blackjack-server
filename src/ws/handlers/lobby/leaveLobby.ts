import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobbyUpdate, broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import logger from '@logger';
import { validateMessage } from '@utils/wsValidators.js';
import { LeaveLobbyInput } from '@utils/validator/lobby.validator.js';

/**
 * Handle player leaving a lobby
 */
export async function handleLeaveLobby(ws: MyWebSocket, wss: Server, msg: LobbyMessage) {
  // Walidacja danych przez Zod
  const validatedData = validateMessage(ws, msg) as LeaveLobbyInput | null;
  if (!validatedData) return;

  const lobby = dataStore.getLobbies().find((l) => l.id === validatedData.lobbyId);
  if (!lobby) {
    logger.info(
      `[LEAVE_LOBBY] Lobby ${validatedData.lobbyId} not found, still confirming leave for ${validatedData.nick}`,
    );
    ws.send(JSON.stringify({ type: 'left_lobby', lobbyId: validatedData.lobbyId, nick: validatedData.nick }));
    return;
  }

  // Usuń gracza
  lobby.players = lobby.players.filter((p) => p !== validatedData.nick);

  // Jeśli odszedł host, wybierz nowego
  if (lobby.host === validatedData.nick) {
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
  ws.send(JSON.stringify({ type: 'left_lobby', lobbyId: lobby.id, nick: validatedData.nick }));

  // Zaktualizuj listę wszystkich lobby
  broadcastLobbyList(wss);
}
