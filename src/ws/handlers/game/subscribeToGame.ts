// src/ws/handlers/gameHandlers.ts
import { MyWebSocket, WsMessage } from '@types';
import { Server } from 'ws';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';

export const handleSubscribeToGame = async (ws: MyWebSocket, wss: Server, msg: WsMessage, game?: any) => {
  const { lobbyName: lobbyId } = msg;

  if (!lobbyId) {
    logger.error(`[SUBSCRIBE_TO_GAME] Brak lobbyId w wiadomości`);
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId' }));
    return;
  }

  // Przypisz klienta do lobby
  ws.lobbyId = lobbyId;
  ws.send(JSON.stringify({ type: 'subscribed_to_game', lobbyId }));
  logger.info(`[SUBSCRIBE_TO_GAME] Klient ${ws.nick ?? 'unknown'} subskrybuje grę w lobby: ${lobbyId}`);

  // Jeśli gra już istnieje, wyślij stan publiczny
  await dataStore.withLock(async () => {
    const game = dataStore.getGames()[lobbyId];
    if (game) {
      const publicState = game.getPublicState();
      ws.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));
    }
  });
};
