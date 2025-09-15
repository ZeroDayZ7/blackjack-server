// src/ws/handlers/lobby/joinLobby.ts
import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobby, broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import logger from '@logger';

export async function handleJoinLobby(ws: MyWebSocket, wss: Server, msg: LobbyMessage) {
  if (!msg.nick || !msg.lobbyId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing nick or lobbyId' }));
    return;
  }

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === msg.lobbyId);
    if (!lobby) {
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    if (lobby.players.includes(msg.nick)) {
      ws.send(JSON.stringify({ type: 'error', message: 'You are already in this lobby' }));
      return;
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby is full' }));
      return;
    }

    // Dodajemy gracza
    lobby.players.push(msg.nick);
    ws.lobbyId = lobby.id;
    ws.nick = msg.nick;

    logger.info(`[JOIN_LOBBY] ${msg.nick} joined lobby ${msg.lobbyId}`);

    // Wysyłamy info do dołączającego
    ws.send(JSON.stringify({ type: 'joined_lobby', nick: msg.nick, lobby }));

    // Broadcast dla wszystkich w lobby
    broadcastLobby(wss, lobby.id);

    // Broadcast całej listy lobby
    broadcastLobbyList(wss);
  });
}
