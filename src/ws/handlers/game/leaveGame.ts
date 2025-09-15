// src/ws/handlers/gameHandlers.ts
import { Server } from 'ws';
import { GameMessage, MyWebSocket, WsMessage } from '@types';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { GameService } from '../../services/gameService.js';
import { Broadcaster } from '../../services/transport/Broadcaster.js';

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
      logger.warn(`[handleStartGame] Lobby nie znalezione: ${lobbyId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    if (lobby.host !== ws.nick) {
      logger.warn(`[handleStartGame] Gracz ${ws.nick} nie jest hostem lobby ${lobbyId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Only host can start the game' }));
      return;
    }

    logger.info(
      `[handleStartGame] Lobby found: ${lobby.id}, host: ${lobby.host}, players: ${lobby.players.join(', ')}`,
    );

    // Dodaj boty jeśli włączone
    if (lobby.useBots) {
      const botsNeeded = lobby.maxPlayers - lobby.players.length;
      for (let i = 0; i < botsNeeded; i++) {
        const botNick = `Bot${i + 1}`;
        lobby.players.push(botNick);
        logger.info(`[handleStartGame] Added bot: ${botNick}`);
      }
    }

    logger.info(`[handleStartGame] Final player list: ${lobby.players.join(', ')}`);

    // Utwórz nową grę
    const gameService = new GameService(lobbyId, [...lobby.players]);
    dataStore.addGame(lobbyId, gameService);
    logger.info(`[handleStartGame] GameService stored in DataStore for lobby ${lobbyId}`);

    // Powiadom WS wszystkich w lobby
    wss.clients.forEach((client: MyWebSocket) => {
      if (client.readyState === 1 && client.lobbyId === lobbyId) {
        client.send(JSON.stringify({ type: 'game_started', lobbyId }));
        logger.info(`[handleStartGame] Sent 'game_started' to ${client.nick}`);
      }
    });

    // Opcjonalnie start pierwszej rundy
    if (lobby.players.length > 0) {
      logger.info(`[handleStartGame] Automatically starting first round for lobby ${lobbyId}`);
      gameService.startNextRound(wss);
    }

    // Broadcast listy lobby
    const broadcaster = new Broadcaster(
      gameService.getState(),
      gameService['playerManager'],
      gameService['dealerManager'],
    );
    broadcaster.broadcastLobbyList(wss);
  });
};

export const handleLeaveGame = async (ws: MyWebSocket, wss: Server, msg: WsMessage) => {
  const { lobbyId, nick } = msg;
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

    // Jeśli host odchodzi, wybierz nowego
    if (lobby.host === ws.nick && lobby.players.length > 0) {
      lobby.host = lobby.players[0];
    }

    // Jeśli lobby puste → usuń lobby i grę
    if (lobby.players.length === 0) {
      dataStore.removeGame(lobbyId);
      dataStore.removeLobby(lobbyId);
      logger.info(`[LEAVE_GAME] Lobby ${lobbyId} removed (no players left)`);
    } else if (game) {
      // Usuń gracza z GameService
      if (ws.nick) {
        game.removePlayer(ws.nick);
      }

      // Wyślij aktualny publiczny stan do pozostałych graczy
      const publicState = game.getPublicState();
      wss.clients.forEach((c: MyWebSocket) => {
        const { nick } = c;
        if (c.readyState === 1 && nick && lobby.players.includes(nick)) {
          c.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));
          const playerState = game.getPlayer(nick);
          if (playerState) c.send(JSON.stringify({ type: 'game_state_private', playerState }));
        }
      });
    }

    ws.send(JSON.stringify({ type: 'left_game', lobbyId }));

    // Broadcast listy lobby
    const broadcaster = new Broadcaster(game?.getState(), game?.['playerManager'], game?.['dealerManager']);
    broadcaster.broadcastLobbyList(wss);
  });
};
