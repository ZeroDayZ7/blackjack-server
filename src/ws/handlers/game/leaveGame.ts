import { Server } from 'ws';
import { MyWebSocket } from '@types';
import logger from '@utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobbyList } from '@ws/services/transport/BroadcasterLobby.js';
import { LeaveGameInput } from '@utils/validator/game.validator.js';

/**
 * Handler opuszczenia gry/lobby przez gracza.
 * Usuwa gracza z gry i lobby, przenosi hosta jeśli konieczne,
 * usuwa pustą grę i lobby, wysyła potwierdzenie i aktualizuje listę lobby.
 */
export const handleLeaveGame = async (ws: MyWebSocket, wss: Server, msg: LeaveGameInput) => {

  const { lobbyId, nick } = msg;

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
    const game = dataStore.getGames()[lobbyId];

    if (!lobby) {
      logger.warn(`[LEAVE_GAME] Lobby not found: ${lobbyId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    logger.info(`[LEAVE_GAME] Player leaving: ${nick} from lobby ${lobbyId}`);

    // Usuń gracza z lobby
    lobby.players = lobby.players.filter((p) => p !== nick);

    // Przenieś hostowanie jeśli opuszczający był hostem
    if (lobby.host === nick && lobby.players.length > 0) {
      const newHost = lobby.players[0];
      lobby.host = newHost;
      logger.info(`[LEAVE_GAME] Host transferred to ${newHost}`);
    }

    // Usuń gracza z gry jeśli istnieje
    if (game) {
      game.removePlayer(nick, wss);
      logger.info(`[LEAVE_GAME] Player removed from game: ${nick}`);
    }

    // Usuń lobby i grę, jeśli nie ma żadnych prawdziwych graczy
    const humanPlayers = lobby.players.filter((p) => !p.startsWith('Bot'));
    if (humanPlayers.length === 0) {
      dataStore.removeGame(lobbyId);
      dataStore.removeLobby(lobbyId);
      logger.info(`[LEAVE_GAME] Removed empty lobby and game: ${lobbyId}`);
    }

    // Potwierdzenie dla wychodzącego gracza
    ws.send(JSON.stringify({ type: 'left_game', lobbyId }));
    logger.info(`[LEAVE_GAME] Sent left_game confirmation to ${nick}`);

    // Broadcast aktualnej listy lobby
    broadcastLobbyList(wss);
    logger.debug(`[LEAVE_GAME] Broadcasted updated lobby list`);
  });
};
