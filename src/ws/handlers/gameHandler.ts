import { MyWebSocket, WsMessage } from '@types';
import { Server } from 'ws';
import logger from '../../utils/logger.js';
import { GameService } from '../services/gameService.js';
import { games, lobbies } from '@ws/data/data.js';

export const handleGameMessage = (
  ws: MyWebSocket,
  wss: Server,
  msg: WsMessage,
) => {
  logger.info(
    `[GAME_MESSAGE] Typ: ${msg.type}, od: ${ws.nick || 'unknown'}, lobbyId: ${
      msg.lobbyId
    }`,
  );

  switch (msg.type) {
    // #region case 'start_game'
    case 'start_game': {
      if (!msg.lobbyId) {
        logger.error(
          `[GAME_MESSAGE] Brak lobbyId w wiadomości typu ${msg.type}`,
        );
        return;
      }

      // znajdź lobby w globalnej tablicy
      const lobby = lobbies.find((l) => l.id === msg.lobbyId);
      if (!lobby) {
        logger.error(
          `[GAME_MESSAGE] Nie znaleziono lobby o ID: ${msg.lobbyId}`,
        );
        return;
      }

      if (lobby.players.length === 0) {
        logger.warn(
          `[GAME_MESSAGE] Próba startu gry w pustym lobby: ${msg.lobbyId}`,
        );
        return;
      }

      const playerNicks = [...lobby.players]; // graczy pobieramy z lobby
      const gameService = new GameService(msg.lobbyId, playerNicks);
      games[msg.lobbyId] = gameService;
      logger.info(
        `[GAME_MESSAGE] Utworzono grę dla lobby ${
          msg.lobbyId
        } z graczami: ${playerNicks.join(', ')}`,
      );

      // powiadomienie graczy o starcie gry
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
          logger.debug(`[GAME_MESSAGE] Wysyłam 'game_started' do ${c.nick}`);
          c.send(
            JSON.stringify({ type: 'game_started', lobbyId: msg.lobbyId }),
          );
        }
      });

      // wysyłamy publiczny stan gry do wszystkich graczy
      const publicState = gameService.getPublicState();
      logger.info(
        `[GAME_MESSAGE] Public state dla lobby ${msg.lobbyId}: ${JSON.stringify(
          publicState,
          null,
          2,
        )}`,
      );
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
          logger.debug(
            `[GAME_MESSAGE] Wysyłam 'game_state_public' do ${c.nick}`,
          );
          c.send(
            JSON.stringify({
              type: 'game_state_public',
              gameState: publicState,
            }),
          );
        }
      });

      break;
    }

    // #region 'subscribe_to_game'
    case 'subscribe_to_game': {
      if (!msg.lobbyId) {
        logger.error(
          `[GAME_MESSAGE] Brak lobbyId w wiadomości typu ${msg.type}`,
        );
        return;
      }
      ws.lobbyId = msg.lobbyId;
      ws.send(
        JSON.stringify({ type: 'subscribed_to_game', lobbyId: msg.lobbyId }),
      );
      logger.info(
        `[SUBSCRIBE_TO_GAME] Klient ${ws.nick} subskrybuje grę w lobby: ${msg.lobbyId}`,
      );

      // jeśli gra już istnieje, od razu wysyłamy jej stan publiczny
      if (games[msg.lobbyId]) {
        const publicState = games[msg.lobbyId].getPublicState();
        ws.send(
          JSON.stringify({ type: 'game_state_public', gameState: publicState }),
        );
      }
      break;
    }

    // #region 'player_action'
    case 'player_action': {
      if (!msg.lobbyId || !ws.nick) {
        logger.warn(`[PLAYER_ACTION] Brak lobbyId lub nick w wiadomości`);
        return;
      }

      const game = games[msg.lobbyId];
      if (!game) {
        logger.warn(
          `[PLAYER_ACTION] Nie znaleziono gry dla lobby ${msg.lobbyId}`,
        );
        return;
      }

      switch (msg.action) {
        case 'hit':
          game.hit(ws.nick);
          logger.info(`[PLAYER_ACTION] ${ws.nick} chose HIT`);
          break;
        case 'stand':
          game.stand(ws.nick);
          logger.info(`[PLAYER_ACTION] ${ws.nick} chose STAND`);
          break;
        default:
          logger.warn(`[PLAYER_ACTION] Nieznana akcja: ${msg.action}`);
      }

      // wysyłamy aktualny publiczny stan gry do wszystkich w lobby
      const publicState = game.getPublicState();
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
          c.send(
            JSON.stringify({
              type: 'game_state_public',
              gameState: publicState,
            }),
          );
        }
      });

      // wysyłamy prywatny stan dla klikającego gracza
      const playerState = game.getPlayer(ws.nick);
      if (playerState) {
        ws.send(JSON.stringify({ type: 'game_state_private', playerState }));
      }

      break;
    }

    // #region 'default'
    default: {
      logger.warn(
        `[GAME_MESSAGE] Nieobsługiwany typ wiadomości: ${msg.type} od ${ws.nick}`,
      );
    }
  }
};
