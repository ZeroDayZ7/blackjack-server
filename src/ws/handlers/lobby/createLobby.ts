import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import crypto from 'crypto';
import logger from '@utils/logger.js';
import { CreateLobbyInput } from '@utils/validator/lobby.validator.js';
import { validateMessage } from '@utils/wsValidators.js';

/**
 * Handle creation of a new lobby
 */
export const handleCreateLobby = async (ws: MyWebSocket, wss: Server, msg: LobbyMessage) => {
  logger.debug(`[HANDLE_CREATE_LOBBY] Received request: ${JSON.stringify(msg, null, 2)}`);

  // Walidacja wiadomości (LobbyMessage)
  const validatedData = validateMessage(ws, msg) as CreateLobbyInput | null;
  if (!validatedData) return;

  const { nick, lobbyName, maxPlayers, useBots = false } = validatedData;
  logger.info(`[CREATE_LOBBY] ${nick} creates lobby: ${lobbyName}`);

  // Sprawdzenie czy gracz już jest w lobby
  const existingLobby = dataStore.getLobbies().find((l) => l.players.includes(nick));
  if (existingLobby) {
    ws.send(JSON.stringify({ type: 'error', message: 'You are already in a lobby' }));
    logger.warn(`[HANDLE_CREATE_LOBBY] Player "${nick}" is already in lobby "${existingLobby.id}"`);
    return;
  }

  // Tworzenie nowego lobby
  const newLobby = {
    id: crypto.randomUUID(),
    name: lobbyName,
    players: [nick],
    maxPlayers: maxPlayers || 2,
    useBots,
    started: false,
    host: nick,
  };
  logger.debug(`[HANDLE_CREATE_LOBBY] New lobby object created ${JSON.stringify(newLobby, null, 2)}`);

  // Dodanie do dataStore
  dataStore.addLobby(newLobby);
  logger.debug(`[HANDLE_CREATE_LOBBY] Lobby "${newLobby.id}" added to dataStore`);

  // Przypisanie ws properties
  ws.lobbyId = newLobby.id;
  ws.nick = nick;
  logger.debug(`[HANDLE_CREATE_LOBBY] WS properties set for player "${nick}"`);

  // Potwierdzenie dla gracza
  ws.send(JSON.stringify({ type: 'joined_lobby', nick, lobby: newLobby }));
  logger.info(`[HANDLE_CREATE_LOBBY] Sent joined_lobby confirmation to "${nick}"`);

  // Broadcast lobby list to all clients
  broadcastLobbyList(wss);
  logger.info(`[HANDLE_CREATE_LOBBY] Broadcasted updated lobby list`);
};
