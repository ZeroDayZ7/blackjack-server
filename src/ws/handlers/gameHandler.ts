import { MyWebSocket, WsMessage } from '@types';
import { Server } from 'ws';
import logger from '../../utils/logger.js';
import { GameService } from '../services/gameService.js';
import { games, lobbies } from '@ws/data/data.js';
import { broadcastLobbyList } from '@ws/utils/broadcast.js';

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

      // Dodaj boty, jeśli opcja włączona
      if (lobby.useBots) {
        const botsNeeded = lobby.maxPlayers - lobby.players.length;
        for (let i = 0; i < botsNeeded; i++) {
          const botNick = `Bot${i + 1}`;
          lobby.players.push(botNick);
        }
        logger.info(
          `[GAME_MESSAGE] Dodano ${botsNeeded} botów do lobby ${msg.lobbyId}`,
        );
      }

      // Utwórz grę
      const playerNicks = [...lobby.players];
      const gameService = new GameService(msg.lobbyId, playerNicks);
      gameService.checkInitialBlackjack(wss);
      games[msg.lobbyId] = gameService;
      logger.info(
        `[GAME_MESSAGE] Utworzono grę dla lobby ${
          msg.lobbyId
        } z graczami: ${playerNicks.join(', ')}`,
      );

      // Powiadom wszystkich klientów w lobby, że gra się rozpoczęła
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
          c.send(
            JSON.stringify({ type: 'game_started', lobbyId: msg.lobbyId }),
          );
        }
      });

      // Wyślij publiczny stan gry
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
          c.send(
            JSON.stringify({
              type: 'game_state_public',
              gameState: publicState,
            }),
          );
        }
      });

      // Automatyczne tury botów jeśli pierwszy gracz to bot
      const firstPlayer = playerNicks[0];
      if (firstPlayer.startsWith('Bot')) {
        setTimeout(() => gameService.advanceTurn(), 200);
      }

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

    // #region 'restart_game'
    case 'restart_game': {
      if (!msg.lobbyId) {
        logger.error(
          `[GAME_MESSAGE] Brak lobbyId w wiadomości typu ${msg.type}`,
        );
        return;
      }

      const game = games[msg.lobbyId];
      if (!game) return;

      // reset gry w serwisie
      game.resetGame();

      // wysyłka stanu publicznego i prywatnego
      const publicState = game.getPublicState();
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
          c.send(
            JSON.stringify({
              type: 'game_state_public',
              gameState: publicState,
            }),
          );

          // prywatny stan dla każdego gracza
          const playerState = game.getPlayer(c.nick);
          if (playerState) {
            c.send(JSON.stringify({ type: 'game_state_private', playerState }));
          }
        }
      });
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

      // Wykonanie akcji gracza
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

      // Automatyczne tury botów
      let nextPlayer = game.getCurrentPlayer();
      while (nextPlayer?.startsWith('Bot')) {
        game.advanceTurn(wss); // bot wykonuje ruch
        nextPlayer = game.getCurrentPlayer();
      }

      // Wysyłamy aktualny publiczny stan gry do wszystkich w lobby
      const publicState = game.getPublicState();
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
          c.send(
            JSON.stringify({
              type: 'game_state_public',
              gameState: publicState,
            }),
          );

          // prywatny stan dla każdego gracza
          const playerState = game.getPlayer(c.nick);
          if (playerState) {
            c.send(JSON.stringify({ type: 'game_state_private', playerState }));
          }
        }
      });

      break;
    }

    // #region 'player_ready'
    case 'player_ready': {
      logger.info(`[PLAYER_READY] Otrzymano gotowość od gracza: ${ws.nick}`);

      if (!msg.lobbyId || !ws.nick) {
        logger.warn(`[PLAYER_READY] Brak lobbyId lub nick w wiadomości`);
        return;
      }

      const game = games[msg.lobbyId];
      if (!game) {
        logger.warn(
          `[PLAYER_READY] Nie znaleziono gry dla lobby ${msg.lobbyId}`,
        );
        return;
      }

      // oznacz gracza jako gotowego
      logger.info(`[PLAYER_READY] Oznaczanie gracza ${ws.nick} jako gotowego`);
      game.playerReady(ws.nick);

      // pobierz publiczny stan gry
      const publicState = game.getPublicState();
      logger.info(
        `[PLAYER_READY] Wysyłanie stanu gry dla lobby ${msg.lobbyId}`,
      );

      // wyślij stan gry wszystkim w lobby
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
          // publiczny stan
          logger.info(
            `[PLAYER_READY] Wysyłanie publicznego stanu do gracza ${c.nick}`,
          );
          c.send(
            JSON.stringify({
              type: 'game_state_public',
              gameState: publicState,
            }),
          );

          // prywatny stan
          const playerState = game.getPlayer(c.nick);
          if (playerState) {
            logger.info(
              `[PLAYER_READY] Wysyłanie prywatnego stanu do gracza ${c.nick}`,
            );
            c.send(JSON.stringify({ type: 'game_state_private', playerState }));
          }
        }
      });

      // jeśli wszyscy gracze-człowieki gotowi → start następnej rundy
      const humanPlayers = Object.keys(game.getState().players).filter(
        (n) => !n.startsWith('Bot'),
      );

      if (humanPlayers.every((nick) => game['readyPlayers'].has(nick))) {
        logger.info(
          `[PLAYER_READY] Wszyscy gracze gotowi, start kolejnej rundy`,
        );
        game.startNextRound();

        // odśwież stan gry po starcie rundy
        const updatedPublicState = game.getPublicState();
        wss.clients.forEach((c: any) => {
          if (c.readyState === 1 && c.lobbyId === msg.lobbyId) {
            c.send(
              JSON.stringify({
                type: 'game_state_public',
                gameState: updatedPublicState,
              }),
            );
            const playerState = game.getPlayer(c.nick);
            if (playerState)
              c.send(
                JSON.stringify({ type: 'game_state_private', playerState }),
              );
          }
        });
      }

      logger.info(
        `[PLAYER_READY] Gotowość gracza ${ws.nick} przetworzona pomyślnie`,
      );
      break;
    }

    // #region 'leave_game'
    case 'leave_game': {
      if (!msg.lobbyId || !ws.nick) return;

      const lobby = lobbies.find((l) => l.id === msg.lobbyId);
      const game = games[msg.lobbyId];

      if (!lobby) return;

      // usuń gracza z lobby
      lobby.players = lobby.players.filter((p) => p !== ws.nick);

      // jeśli gracz był hostem, wybierz nowego
      if (lobby.host === ws.nick && lobby.players.length > 0) {
        lobby.host = lobby.players[0];
      }

      // jeśli lobby puste, usuń grę i lobby
      if (lobby.players.length === 0) {
        delete games[msg.lobbyId];
        const index = lobbies.findIndex((l) => l.id === msg.lobbyId);
        if (index >= 0) lobbies.splice(index, 1);
        logger.info(`[LEAVE_GAME] Lobby ${msg.lobbyId} usunięte (brak graczy)`);
      } else if (game) {
        // usuń gracza z gameService
        game.removePlayer(ws.nick);

        // wyślij aktualny publiczny stan do pozostałych graczy
        const publicState = game.getPublicState();
        wss.clients.forEach((c: any) => {
          if (c.readyState === 1 && lobby.players.includes(c.nick)) {
            c.send(
              JSON.stringify({
                type: 'game_state_public',
                gameState: publicState,
              }),
            );
            const playerState = game.getPlayer(c.nick);
            if (playerState)
              c.send(
                JSON.stringify({ type: 'game_state_private', playerState }),
              );
          }
        });
      }

      ws.send(JSON.stringify({ type: 'left_game', lobbyId: msg.lobbyId }));
      broadcastLobbyList(wss);
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
