import { Server, WebSocket } from 'ws';
import { MyWebSocket, WsMessage } from '@types';
import { GameService } from '../../services/gameService.js';
import { dataStore } from '@ws/data/data.js';
import logger from '../../../utils/logger.js';
import { Broadcaster } from '../../services/transport/Broadcaster.js';

export const handleStartGame = async (ws: MyWebSocket, wss: Server, msg: WsMessage) => {
  const { lobbyId } = msg;
  if (!lobbyId || !ws.nick) {
    logger.warn(`[handleStartGame] Brak lobbyId w wiadomości od ${ws.nick}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === msg.lobbyId);
    if (!lobby) {
      logger.warn(`[handleStartGame] Lobby nie znalezione: ${msg.lobbyId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    if (lobby.host !== ws.nick) {
      logger.warn(`[handleStartGame] Gracz ${ws.nick} nie jest hostem lobby ${msg.lobbyId}`);
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
    logger.info(`[handleStartGame] GameService initialized for lobby ${msg.lobbyId}`);

    dataStore.addGame(lobbyId, gameService);
    logger.info(`[handleStartGame] GameService stored in games map: ${Object.keys(dataStore.getGames()).join(', ')}`);

    // Powiadom WS
    wss.clients.forEach((client: MyWebSocket) => {
      if (client.readyState === WebSocket.OPEN && client.lobbyId === msg.lobbyId) {
        client.send(JSON.stringify({ type: 'game_started', lobbyId: msg.lobbyId }));
        logger.info(`[handleStartGame] Sent 'game_started' WS message to ${client.nick}`);
      }
    });

    // Opcjonalnie automatyczny start rundy po inicjalizacji
    if (lobby.players.length > 0) {
      logger.info(`[handleStartGame] Automatically starting first round for lobby ${msg.lobbyId}`);
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
