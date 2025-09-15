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
  logger.debug(`[HANDLE_CREATE_LOBBY] Received request: ${JSON.stringify(msg, null, 2)}`);

  // Guard clause – brak nick lub lobbyName
  if (!msg.nick || !msg.lobbyName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing nick or lobbyName' }));
    logger.warn(`[HANDLE_CREATE_LOBBY] Missing nick or lobbyName from client`);
    return;
  }

  // Sprawdzenie czy gracz już jest w lobby
  const existingLobby = dataStore.getLobbies().find((l) => l.players.includes(msg.nick));
  if (existingLobby) {
    ws.send(JSON.stringify({ type: 'error', message: 'You are already in a lobby' }));
    logger.warn(`[HANDLE_CREATE_LOBBY] Player "${msg.nick}" is already in lobby "${existingLobby.id}"`);
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
  logger.debug(`[HANDLE_CREATE_LOBBY] New lobby object created ${JSON.stringify(newLobby, null, 2)}`);

  // Dodanie do dataStore
  dataStore.addLobby(newLobby);
  logger.debug(`[HANDLE_CREATE_LOBBY] Lobby "${newLobby.id}" added to dataStore`);

  // Przypisanie ws properties
  ws.lobbyId = newLobby.id;
  ws.nick = msg.nick;
  logger.debug(`[HANDLE_CREATE_LOBBY] WS properties set for player "${msg.nick}"`);

  // Potwierdzenie dla gracza
  ws.send(JSON.stringify({ type: 'joined_lobby', nick: msg.nick, lobby: newLobby }));
  logger.info(`[HANDLE_CREATE_LOBBY] Sent joined_lobby confirmation to "${msg.nick}"`);

  // Broadcast lobby list to all clients
  broadcastLobbyList(wss);
  logger.info(`[HANDLE_CREATE_LOBBY] Broadcasted updated lobby list`);
}
