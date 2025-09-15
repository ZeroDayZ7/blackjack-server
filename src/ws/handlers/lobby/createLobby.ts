import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import crypto from 'crypto';
import logger from '@utils/logger.js';

/**
 * Handle creation of a new lobby
 */
export async function handleCreateLobby(ws: MyWebSocket, wss: Server, msg: LobbyMessage) {
  // Guard clause – brak nick lub lobbyName
  if (!msg.nick || !msg.lobbyName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing nick or lobbyName' }));
    return;
  }

  // Sprawdzenie czy gracz już jest w lobby
  const existingLobby = dataStore.getLobbies().find((l) => l.players.includes(msg.nick));
  if (existingLobby) {
    ws.send(JSON.stringify({ type: 'error', message: 'You are already in a lobby' }));
    return;
  }

  // Tworzenie nowego lobby
  const newLobby = {
    id: crypto.randomUUID(),
    name: msg.lobbyName,
    players: [msg.nick],
    maxPlayers: msg.maxPlayers || 2,
    useBots: msg.useBots ?? true,
    started: false,
    host: msg.nick,
  };

  // Dodanie do dataStore
  dataStore.addLobby(newLobby);

  // Przypisanie ws properties
  ws.lobbyId = newLobby.id;
  ws.nick = msg.nick;

  // Potwierdzenie dla gracza
  ws.send(JSON.stringify({ type: 'joined_lobby', nick: msg.nick, lobby: newLobby }));

  logger.info(`[CREATE_LOBBY] Lobby created: ${JSON.stringify(newLobby, null, 2)}`);

  await broadcastLobbyList(wss);
}
