import { Server, WebSocket } from 'ws';
import { LobbyMessage, MyWebSocket, WsMessage } from '@types';
import logger from '../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { Broadcaster } from '../services/transport/Broadcaster.js';
import crypto from 'crypto';

export const handleLobbyMessage = async (ws: MyWebSocket, wss: Server, msg: LobbyMessage) => {
  await dataStore.withLock(async () => {
    switch (msg.type) {
      case 'create_lobby':
        logger.info(`$create_lobby`);
        if (!msg.nick || !msg.lobbyId) {
          logger.warn(`[CREATE_LOBBY] Brak nick lub lobbyName w wiadomości od ${ws.nick ?? 'unknown'}`);
          ws.send(JSON.stringify({ type: 'error', message: 'Missing nick or lobbyName' }));
          return;
        }

        logger.info(`[CREATE_LOBBY] Próba utworzenia lobby przez: ${msg.nick}`);

        const existingLobby = dataStore.getLobbies().find((l) => l.players.includes(msg.nick));
        if (existingLobby) {
          logger.warn(`[CREATE_LOBBY] ${msg.nick} jest już w lobby ${existingLobby.id}`);
          ws.send(JSON.stringify({ type: 'error', message: 'You are already in a lobby' }));
          return;
        }

        const newLobby = {
          id: crypto.randomUUID(),
          name: msg.lobbyId,
          players: [msg.nick],
          maxPlayers: msg.maxPlayers || 2,
          useBots: msg.useBots ?? true,
          started: false,
          host: msg.nick,
        };
        dataStore.addLobby(newLobby);
        logger.info(`[CREATE_LOBBY] Lobby utworzone: ${JSON.stringify(newLobby, null, 2)}`);

        ws.lobbyId = newLobby.id;
        ws.nick = msg.nick;

        ws.send(JSON.stringify({ type: 'joined_lobby', nick: msg.nick, lobby: newLobby }));
        logger.info(`[CREATE_LOBBY] Wysłano joined_lobby do twórcy: ${msg.nick}`);

        // Broadcast listy lobby
        const broadcaster = new Broadcaster({} as any, {} as any, {} as any); // Tymczasowe, wymaga poprawnego GameState
        await broadcaster.broadcastLobbyList(wss);
        logger.info(`[CREATE_LOBBY] Wysłano broadcastLobbyList do wszystkich`);
        break;

      case 'join_lobby':
        if (!msg.nick || !msg.lobbyId) {
          logger.warn(`[JOIN_LOBBY] Brak nick lub lobbyId w wiadomości od ${ws.nick ?? 'unknown'}`);
          ws.send(JSON.stringify({ type: 'error', message: 'Missing nick or lobbyId' }));
          return;
        }

        logger.info(`[JOIN_LOBBY] Próba dołączenia: ${msg.nick} do lobby: ${msg.lobbyId}`);

        const lobbyToJoin = dataStore.getLobbies().find((l) => l.id === msg.lobbyId);
        if (!lobbyToJoin) {
          logger.warn(`[JOIN_LOBBY] Lobby ${msg.lobbyId} nie istnieje`);
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
          return;
        }

        if (lobbyToJoin.players.includes(msg.nick)) {
          logger.warn(`[JOIN_LOBBY] ${msg.nick} już jest w lobby ${msg.lobbyId}`);
          ws.send(JSON.stringify({ type: 'error', message: 'You are already in this lobby' }));
          return;
        }

        if (lobbyToJoin.players.length >= lobbyToJoin.maxPlayers) {
          logger.warn(`[JOIN_LOBBY] Lobby ${msg.lobbyId} jest pełne`);
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby is full' }));
          return;
        }

        lobbyToJoin.players.push(msg.nick);
        ws.lobbyId = lobbyToJoin.id;
        ws.nick = msg.nick;

        logger.info(`[JOIN_LOBBY] ${msg.nick} dołączył do lobby: ${msg.lobbyId}`);
        logger.info(`[JOIN_LOBBY] Aktualni gracze: ${JSON.stringify(lobbyToJoin.players)}`);

        // Broadcast aktualizacji lobby i listy lobby
        broadcastLobbyUpdate(wss, lobbyToJoin);
        const broadcasterJoin = new Broadcaster({} as any, {} as any, {} as any); // Tymczasowe
        await broadcasterJoin.broadcastLobbyList(wss);
        logger.info(`[JOIN_LOBBY] Wysłano broadcastLobbyUpdate i broadcastLobbyList`);

        ws.send(JSON.stringify({ type: 'joined_lobby', nick: msg.nick, lobby: lobbyToJoin }));
        logger.info(`[JOIN_LOBBY] Wysłano joined_lobby do dołączającego: ${msg.nick}`);
        break;

      case 'leave_lobby':
        if (!msg.nick || !msg.lobbyId) {
          logger.warn(`[LEAVE_LOBBY] Brak nick lub lobbyId w wiadomości od ${ws.nick ?? 'unknown'}`);
          ws.send(JSON.stringify({ type: 'error', message: 'Missing nick or lobbyId' }));
          return;
        }

        logger.info(`[LEAVE_LOBBY] ${msg.nick} opuszcza lobby: ${msg.lobbyId}`);

        const leaveLobby = dataStore.getLobbies().find((l) => l.id === msg.lobbyId);
        if (!leaveLobby) {
          logger.warn(`[LEAVE_LOBBY] Nie znaleziono lobby ${msg.lobbyId}`);
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
          return;
        }

        logger.info(`[LEAVE_LOBBY] Przed opuszczeniem gracze: ${JSON.stringify(leaveLobby.players)}`);

        // Usuwamy gracza z listy
        leaveLobby.players = leaveLobby.players.filter((p) => p !== msg.nick);

        // Jeśli opuszczający był hostem i są inni gracze, wybieramy nowego hosta
        if (leaveLobby.host === msg.nick && leaveLobby.players.length > 0) {
          leaveLobby.host = leaveLobby.players[0];
          logger.info(`[LEAVE_LOBBY] Nowy host: ${leaveLobby.host}`);
        }

        // Jeśli lobby puste, usuwamy je
        if (leaveLobby.players.length === 0) {
          dataStore.removeLobby(leaveLobby.id);
          logger.info(`[LEAVE_LOBBY] Lobby ${leaveLobby.id} usunięte (brak graczy)`);
        }

        // Broadcast aktualizacji lobby i listy lobby
        if (leaveLobby.players.length > 0) {
          broadcastLobbyUpdate(wss, leaveLobby);
          logger.info(`[LEAVE_LOBBY] Wysłano broadcastLobbyUpdate dla lobby: ${leaveLobby.id}`);
        }
        const broadcasterLeave = new Broadcaster({} as any, {} as any, {} as any); // Tymczasowe
        await broadcasterLeave.broadcastLobbyList(wss);
        logger.info(`[LEAVE_LOBBY] Wysłano broadcastLobbyList`);

        // Informacja dla opuszczającego gracza
        ws.send(JSON.stringify({ type: 'left_lobby', lobbyId: msg.lobbyId, nick: msg.nick }));
        logger.info(`[LEAVE_LOBBY] Wysłano left_lobby do gracza ${msg.nick}`);
        break;

      case 'ping_lobbies':
        logger.info(`ping_lobbies`);

        // Wersja async z lockiem
        await dataStore.withLock(async () => {
          const lobbyList = dataStore.getLobbies().map((l) => ({
            id: l.id,
            players: l.players,
            host: l.host,
            maxPlayers: l.maxPlayers,
            useBots: l.useBots,
          }));

          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'lobby_list_update', lobbies: lobbyList }));
            }
          });
        });

        logger.info(`[PING_LOBBIES] Wysłano lobby_list_update`);
        break;

      default:
        logger.warn(`[LOBBY_MESSAGE] Unhandled message type: ${msg.type} from ${ws.nick ?? 'unknown'}`);
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
        break;
    }
  });
};

// Helper do aktualizacji pojedynczego lobby
function broadcastLobbyUpdate(wss: Server, lobby: any) {
  wss.clients.forEach((client: MyWebSocket) => {
    if (client.readyState === WebSocket.OPEN && client.nick && lobby.players.includes(client.nick)) {
      client.send(JSON.stringify({ type: 'lobby_update', lobby }));
    }
  });
}
