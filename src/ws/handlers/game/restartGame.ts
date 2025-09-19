import { Server } from 'ws';
import { MyWebSocket } from '@types';
import logger from '@utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { BroadcasterGame } from '@ws/services/transport/BroadcasterGame.js';
import { RestartGameInput } from '@utils/validator/game.validator.js';

/**
 * Handler restartu gry w lobby.
 * Tylko host może zrestartować grę.
 */
export const handleRestartGame = async (ws: MyWebSocket, wss: Server, msg: RestartGameInput) => {

  const { lobbyId, nick } = msg;

  await dataStore.withLock(async () => {
    const game = dataStore.getGames()[lobbyId];
    if (!game) {
      ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
      logger.warn(`[RESTART_GAME] Game not found for lobby ${lobbyId}`);
      return;
    }

    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
    if (!lobby) {
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      logger.warn(`[RESTART_GAME] Lobby not found: ${lobbyId}`);
      return;
    }

    if (lobby.host !== nick) {
      ws.send(JSON.stringify({ type: 'error', message: 'Only host can restart the game' }));
      logger.warn(`[RESTART_GAME] Unauthorized restart attempt by ${nick} in lobby ${lobbyId}`);
      return;
    }

    logger.info(`[RESTART_GAME] Restart gry w lobby ${lobbyId} przez hosta ${nick}`);

    // Reset gry
    game.resetGame(wss);

    // Broadcast stanu gry do wszystkich graczy w lobby
    const broadcaster = new BroadcasterGame(game.getState(), game['playerManager'], game['dealerManager']);
    broadcaster.broadcast(wss);

    logger.info(`[RESTART_GAME] Broadcast zrestartowanej gry wysłany dla lobby ${lobbyId}`);
  });
};
