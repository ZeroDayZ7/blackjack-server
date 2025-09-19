import { Server, WebSocket } from 'ws';
import { MyWebSocket } from '@types';
import { GameService } from '../../services/gameService.js';
import { dataStore } from '@ws/data/data.js';
import logger from '../../../utils/logger.js';
import { BroadcasterGame } from '../../services/transport/BroadcasterGame.js';
import { StartGameInput } from '@utils/validator/game.validator.js';

export const handleStartGame = async (ws: MyWebSocket, wss: Server, msg: StartGameInput) => {

  const { lobbyId, nick } = msg;

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
    if (!lobby) {
      logger.warn(`[handleStartGame] Lobby nie znalezione: ${lobbyId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    if (lobby.host !== nick) {
      logger.warn(`[handleStartGame] Gracz ${nick} nie jest hostem lobby ${lobbyId}`);
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

    const gameService = new GameService(lobbyId, [...lobby.players]);
    logger.info(`[handleStartGame] GameService initialized for lobby ${lobbyId}`);

    dataStore.addGame(lobbyId, gameService);
    logger.info(`[handleStartGame] GameService stored in games map: ${Object.keys(dataStore.getGames()).join(', ')}`);

    // Powiadom WS
    wss.clients.forEach((client: MyWebSocket) => {
      if (client.readyState === WebSocket.OPEN && client.lobbyId === lobbyId) {
        client.inGame = true; // 🔹 oznaczamy gracza jako "w grze"
        client.send(JSON.stringify({ type: 'game_started', lobbyId: lobbyId }));
        logger.info(`[handleStartGame] Sent 'game_started' WS message to ${client.nick}`);
      }
    });

    // Opcjonalnie automatyczny start rundy po inicjalizacji
    if (lobby.players.length > 0) {
      logger.info(`[handleStartGame] Automatically starting first round for lobby ${lobbyId}`);
      gameService.startNextRound(wss);
    }

    // Broadcast listy lobby
    const broadcaster = new BroadcasterGame(
      gameService.getState(),
      gameService['playerManager'],
      gameService['dealerManager'],
    );
    broadcaster.broadcast(wss);
  });
};
