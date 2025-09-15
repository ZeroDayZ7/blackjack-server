import { Server, WebSocket } from 'ws';
import { MyWebSocket, WsMessage } from '@types';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { Broadcaster } from '@ws/services/transport/Broadcaster.js';

export const handleRestartGame = async (ws: MyWebSocket, wss: Server, msg: WsMessage) => {
  const { lobbyId } = msg;
  if (!lobbyId || !ws.nick) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  await dataStore.withLock(async () => {
    const game = dataStore.getGames()[lobbyId];
    if (!game) {
      ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
      return;
    }

    const lobby = dataStore.getLobbies().find((l) => l.id === msg.lobbyId);
    if (!lobby || lobby.host !== ws.nick) {
      ws.send(JSON.stringify({ type: 'error', message: 'Only host can restart the game' }));
      return;
    }

    logger.info(`[RESTART_GAME] Restart gry w lobby ${msg.lobbyId}`);

    // Reset gry
    game.resetGame(wss);

    // Broadcast stanu gry za pomocą Broadcaster
    const broadcaster = new Broadcaster(game.getState(), game['playerManager'], game['dealerManager']);
    broadcaster.broadcast(wss);
  });
};
