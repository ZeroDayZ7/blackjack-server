// src/ws/handlers/playerHandlers.ts
import { Server } from 'ws';
import { MyWebSocket, WsMessage } from '@types';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';

export const handlePlayerReady = async (ws: MyWebSocket, wss: Server, msg: WsMessage) => {
  const { lobbyName: lobbyId, nick } = msg;

  if (!lobbyId || !ws.nick || !nick) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  await dataStore.withLock(async () => {
    const game = dataStore.getGames()[lobbyId];
    if (!game) {
      logger.warn(`[PLAYER_READY] Nie znaleziono gry dla lobby ${lobbyId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
      return;
    }

    logger.info(`[PLAYER_READY] Oznaczanie gracza ${ws.nick} jako gotowego`);
    const playerNick: string = ws.nick!;
    game.playerReady(playerNick);

    // Wyślij aktualny publiczny stan gry wszystkim w lobby
    const publicState = game.getPublicState();
    wss.clients.forEach((c: MyWebSocket) => {
      if (c.readyState !== 1 || c.lobbyId !== lobbyId || !c.nick) return;

      c.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));

      const playerState = game.getPlayer(c.nick);
      if (playerState) {
        c.send(JSON.stringify({ type: 'game_state_private', playerState }));
      }
    });

    // Jeśli wszyscy gracze gotowi → start kolejnej rundy
    if (game.areAllPlayersReady()) {
      logger.info(`[PLAYER_READY] Wszyscy gracze gotowi, start kolejnej rundy`);
      game.startNextRound(wss); // Broadcast po starcie rundy jest już w startNextRound
    }
  });
};
