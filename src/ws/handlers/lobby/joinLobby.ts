import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobby, broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import logger from '@logger';
import { validateMessage } from '@utils/wsValidators.js';
import { JoinLobbyInput } from '@utils/validator/lobby.validator.js';

/**
 * Handle player joining a lobby
 */
export async function handleJoinLobby(ws: MyWebSocket, wss: Server, msg: LobbyMessage) {
  // Walidacja danych przez Zod
  const validatedData = validateMessage(ws, msg) as JoinLobbyInput | null;
  if (!validatedData) return;

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === validatedData.lobbyId);
    if (!lobby) {
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    if (lobby.players.includes(validatedData.nick)) {
      ws.send(JSON.stringify({ type: 'error', message: 'You are already in this lobby' }));
      return;
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby is full' }));
      return;
    }

    // Dodajemy gracza
    lobby.players.push(validatedData.nick);
    ws.lobbyId = lobby.id;
    ws.nick = validatedData.nick;

    logger.info(`[JOIN_LOBBY] ${validatedData.nick} joined lobby ${validatedData.lobbyId}`);

    // Potwierdzenie do gracza
    ws.send(JSON.stringify({ type: 'joined_lobby', nick: validatedData.nick, lobby }));

    // Broadcast do wszystkich w lobby
    broadcastLobby(wss, lobby.id);

    // Broadcast całej listy lobby
    broadcastLobbyList(wss);
  });
}
