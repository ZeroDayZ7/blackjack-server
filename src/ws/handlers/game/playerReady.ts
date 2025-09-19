// src/ws/handlers/playerHandlers.ts
import { Server } from 'ws';
import { MyWebSocket } from '@types';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { PlayerReadyInput } from '@utils/validator/game.validator.js';

/**
 * Handler for marking a player as ready.
 * Updates game state, sends public & private game states to all clients,
 * and starts next round if all players are ready.
 */
export const handlePlayerReady = async (ws: MyWebSocket, wss: Server, msg: PlayerReadyInput) => {
 
  const { lobbyId, nick } = msg;

  await dataStore.withLock(async () => {
    const game = dataStore.getGames()[lobbyId];
    if (!game) {
      logger.warn(`[PLAYER_READY] Game not found for lobby ${lobbyId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
      return;
    }

    logger.info(`[PLAYER_READY] Marking player "${nick}" as ready`);
    game.playerReady(nick);

    // Broadcast current public game state to all clients in the lobby
    const publicState = game.getPublicState();
    wss.clients.forEach((client: MyWebSocket) => {
      if (client.readyState !== 1 || client.lobbyId !== lobbyId || !client.nick) return;

      // Public state visible to all
      client.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));

      // Private state for individual player
      const playerState = game.getPlayer(client.nick);
      if (playerState) {
        client.send(JSON.stringify({ type: 'game_state_private', playerState }));
      }
    });

    // Automatically start next round if all players are ready
    if (game.areAllPlayersReady()) {
      logger.info(`[PLAYER_READY] All players ready, starting next round`);
      game.startNextRound(wss); // startNextRound already handles broadcasting
    }
  });
};
