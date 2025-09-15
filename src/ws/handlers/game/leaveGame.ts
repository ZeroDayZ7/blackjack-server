import { Server } from 'ws';
import { GameMessage, MyWebSocket, WsMessage } from '@types';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { GameService } from '../../services/gameService.js';
import { broadcastLobbyList } from '../../services/transport/BroadcasterLobby.js'; // <- używamy tej funkcji

export const handleStartGame = async (ws: MyWebSocket, wss: Server, msg: GameMessage) => {
  const { lobbyId } = msg;
  if (!lobbyId || !ws.nick) {
    logger.warn(`[handleStartGame] Brak lobbyId w wiadomości od ${ws.nick}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
    if (!lobby) {
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    if (lobby.host !== ws.nick) {
      ws.send(JSON.stringify({ type: 'error', message: 'Only host can start the game' }));
      return;
    }

    if (lobby.useBots) {
      const botsNeeded = lobby.maxPlayers - lobby.players.length;
      for (let i = 0; i < botsNeeded; i++) {
        const botNick = `Bot${i + 1}`;
        lobby.players.push(botNick);
      }
    }

    const gameService = new GameService(lobbyId, [...lobby.players]);
    dataStore.addGame(lobbyId, gameService);

    // Wyślij info o starcie gry WS
    wss.clients.forEach((client: MyWebSocket) => {
      if (client.readyState === 1 && client.lobbyId === lobbyId) {
        client.send(JSON.stringify({ type: 'game_started', lobbyId }));
      }
    });

    // Start pierwszej rundy
    if (lobby.players.length > 0) gameService.startNextRound(wss);

    // Broadcast aktualnej listy lobby
    await broadcastLobbyList(wss);
  });
};

export const handleLeaveGame = async (ws: MyWebSocket, wss: Server, msg: WsMessage) => {
  const { lobbyId } = msg;
  if (!lobbyId || !ws.nick) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
    const game = dataStore.getGames()[lobbyId];
    if (!lobby) return;

    // Usuń gracza z lobby
    lobby.players = lobby.players.filter((p) => p !== ws.nick);

    if (lobby.host === ws.nick && lobby.players.length > 0) {
      lobby.host = lobby.players[0];
    }

    if (lobby.players.length === 0) {
      dataStore.removeGame(lobbyId);
      dataStore.removeLobby(lobbyId);
    } else if (game) {
      if (ws.nick && game) {
        game.removePlayer(ws.nick, wss);
      }
    }

    ws.send(JSON.stringify({ type: 'left_game', lobbyId }));

    // Broadcast aktualnej listy lobby
    await broadcastLobbyList(wss);
  });
};
