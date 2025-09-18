import { Server } from 'ws';
import { MyWebSocket, WsMessage } from '@types';
import logger from '../../../utils/logger.js';
import { dataStore } from '@ws/data/data.js';
import { broadcastLobbyList } from '../../services/transport/BroadcasterLobby.js'; // <- używamy tej funkcji

export const handleLeaveGame = async (ws: MyWebSocket, wss: Server, msg: WsMessage) => {
  logger.info('[handleLeaveGame] called', { nick: ws.nick, lobbyId: msg.lobbyId });

  const { lobbyId } = msg;
  if (!lobbyId || !ws.nick) {
    logger.warn('[handleLeaveGame] Missing lobbyId or nick', { lobbyId, nick: ws.nick });
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  await dataStore.withLock(async () => {
    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
    const game = dataStore.getGames()[lobbyId];
    logger.debug('[handleLeaveGame] fetched lobby and game', { lobby, game });

    if (!lobby) {
      logger.warn('[handleLeaveGame] Lobby not found', { lobbyId });
      return;
    }

    // Usuń gracza z lobby
    lobby.players = lobby.players.filter((p) => p !== ws.nick);
    logger.info('[handleLeaveGame] removed player from lobby', { nick: ws.nick, remainingPlayers: lobby.players });

    // Jeżeli opuszczający był hostem, przekaż hostowanie
    if (lobby.host === ws.nick && lobby.players.length > 0) {
      lobby.host = lobby.players[0];
      logger.info('[handleLeaveGame] transferred host', { newHost: lobby.host });
    }

    if (game) {
      game.removePlayer(ws.nick!, wss);
      logger.info('[handleLeaveGame] removed player from game', { nick: ws.nick });
    }

    // Sprawdź, czy w lobby pozostał choć jeden prawdziwy gracz
    const humanPlayers = lobby.players.filter((p) => !p.startsWith('Bot'));

    if (humanPlayers.length === 0) {
      // Usuń grę i lobby, jeśli nie ma żadnego człowieka
      dataStore.removeGame(lobbyId);
      dataStore.removeLobby(lobbyId);
      logger.info('[handleLeaveGame] removed empty lobby and game', { lobbyId });
    }

    ws.send(JSON.stringify({ type: 'left_game', lobbyId }));
    logger.info('[handleLeaveGame] sent left_game message', { lobbyId, nick: ws.nick });

    // Broadcast aktualnej listy lobby
    broadcastLobbyList(wss);
    logger.debug('[handleLeaveGame] broadcasted lobby list');
  });
};
