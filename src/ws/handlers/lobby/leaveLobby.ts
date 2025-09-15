import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage, Lobby } from '@types';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobbyUpdate, broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import logger from '@logger';

export async function handleLeaveLobby(ws: MyWebSocket, wss: Server, msg: LobbyMessage) {
  if (!msg.nick || !msg.lobbyId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing nick or lobbyId' }));
    return;
  }

  const lobby = dataStore.getLobbies().find((l) => l.id === msg.lobbyId);
  if (!lobby) {
    ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
    return;
  }

  // Usuń gracza
  lobby.players = lobby.players.filter((p) => p !== msg.nick);

  // Jeśli odszedł host, wybierz nowego
  if (lobby.host === msg.nick) {
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
  ws.send(JSON.stringify({ type: 'left_lobby', lobbyId: lobby.id, nick: msg.nick }));

  // Zaktualizuj listę wszystkich lobby
  await broadcastLobbyList(wss);
}
