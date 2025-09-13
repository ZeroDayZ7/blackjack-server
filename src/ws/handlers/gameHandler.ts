import logger from "@utils/logger.js";
import { GameService } from "../services/gameService.js";
import { games } from "@server/data/data.js";

export const handleGameMessage = (ws: any, wss: any, msg: any) => {
  logger.info(
    `[GAME_MESSAGE] Typ: ${msg.type}, od: ${ws.nick || "unknown"}, lobbyId: ${
      msg.lobbyId
    }`
  );

  switch (msg.type) {
    case "start_game":
      logger.info(`[START_GAME] Próba startu gry dla lobby: ${msg.lobbyId}`);

      // pobieramy nicki graczy w lobby
      const playerNicks = Array.from(wss.clients)
        .filter((c: any) => c.lobbyId === msg.lobbyId)
        .map((c: any) => c.nick);
      logger.info(`[START_GAME] Gracze w lobby: ${playerNicks.join(", ")}`);

      // tworzymy serwis gry
      const gameService = new GameService(msg.lobbyId, playerNicks);
      games[msg.lobbyId] = gameService;
      logger.info(
        `[START_GAME] Utworzono GameService dla lobby: ${msg.lobbyId}`
      );

      // logowanie początkowego stanu gry
      logger.info(
        `[START_GAME] Początkowy stan gry: ${JSON.stringify(
          gameService.getPublicState(),
          null,
          2
        )}`
      );

      // POWIADOMIENIE O ROZPOCZĘCIU GRY
      wss.clients.forEach((client: any) => {
        if (client.readyState !== 1 || client.lobbyId !== msg.lobbyId) return;
        client.send(
          JSON.stringify({ type: "game_started", lobbyId: msg.lobbyId })
        );
      });
      logger.info(`[START_GAME] Wysłano game_started do wszystkich w lobby`);

      // rozsyłamy stan gry
      wss.clients.forEach((client: any) => {
        if (client.readyState !== 1 || client.lobbyId !== msg.lobbyId) return;

        // publiczny stan gry
        const publicState = gameService.getPublicState();
        client.send(
          JSON.stringify({ type: "game_state_public", gameState: publicState })
        );
        logger.info(`[START_GAME] Wysłano publiczny stan do: ${client.nick}`);

        // prywatny stan dla konkretnego gracza
        const privateState = gameService.getPrivateState(client.nick);
        if (privateState) {
          client.send(
            JSON.stringify({
              type: "game_state_private",
              playerState: privateState,
            })
          );
          logger.info(
            `[START_GAME] Wysłano prywatną rękę do ${
              client.nick
            }: ${JSON.stringify(privateState.hand)}`
          );
        }
      });
      break;

    case "subscribe_to_game":
      ws.lobbyId = msg.lobbyId;
      ws.send(
        JSON.stringify({ type: "subscribed_to_game", lobbyId: msg.lobbyId })
      );
      logger.info(
        `[SUBSCRIBE_TO_GAME] Klient ${ws.nick} subskrybuje grę w lobby: ${msg.lobbyId}`
      );
      break;

    case "player_action":
      const service = games[msg.lobbyId];
      if (!service) {
        logger.warn(`[PLAYER_ACTION] Brak gry dla lobby ${msg.lobbyId}`);
        return;
      }

      logger.info(
        `[PLAYER_ACTION] Akcja od ${ws.nick} w lobby ${
          msg.lobbyId
        }: ${JSON.stringify(msg.action)}`
      );

      // TODO: implementacja hit/stand/double itp.

      // odświeżamy stany gry
      wss.clients.forEach((client: any) => {
        if (client.readyState !== 1 || client.lobbyId !== msg.lobbyId) return;

        const publicState = service.getPublicState();
        client.send(
          JSON.stringify({
            type: "game_state_public",
            gameState: publicState,
          })
        );
        logger.info(
          `[PLAYER_ACTION] Wysłano zaktualizowany publiczny stan do: ${client.nick}`
        );

        const privateState = service.getPrivateState(client.nick);
        if (privateState) {
          client.send(
            JSON.stringify({
              type: "game_state_private",
              playerState: privateState,
            })
          );
          logger.info(
            `[PLAYER_ACTION] Wysłano zaktualizowaną prywatną rękę do ${
              client.nick
            }: ${JSON.stringify(privateState.hand)}`
          );
        }
      });
      break;

    default:
      logger.warn(
        `[GAME_MESSAGE] Nieobsługiwany typ wiadomości: ${msg.type} od ${ws.nick}`
      );
  }
};
