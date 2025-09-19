// src/ws/handlers/gameHandlers.ts
import { MyWebSocket, GameMessage } from '@types';
import { Server } from 'ws';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { validateMessage } from '@utils/wsValidators.js';
import { GameSchemas, SubscribeGameInput } from '@utils/validator/game.validator.js';

/**
 * Handler for a player subscribing to a game.
 * Assigns the WebSocket client to the lobby,
 * sends confirmation, and sends the current public game state if the game exists.
 */
export const handleSubscribeToGame = async (ws: MyWebSocket, _wss: Server, msg: SubscribeGameInput) => {
 
  const { lobbyId, nick } = msg;

  // Assign the client to the lobby
  ws.lobbyId = lobbyId;
  ws.nick = nick;

  // Send subscription confirmation to the client
  ws.send(JSON.stringify({ type: 'subscribed_to_game', lobbyId }));
  logger.info(`[SUBSCRIBE_TO_GAME] Player "${nick}" subscribed to game in lobby: ${lobbyId}`);

  // If the game already exists, send the public game state to the client
  await dataStore.withLock(async () => {
    const game = dataStore.getGames()[lobbyId];
    if (game) {
      const publicState = game.getPublicState();
      ws.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));
      logger.debug(`[SUBSCRIBE_TO_GAME] Sent public game state to player "${nick}" for lobby ${lobbyId}`);
    }
  });
};
