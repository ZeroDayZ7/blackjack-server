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

      // lobby.started = true;

      // Tworzymy nowy serwis gry i zapisujemy w globalnym obiekcie
      const playerNicks = Array.from(wss.clients)
        .filter((c: any) => c.lobbyId === msg.lobbyId)
        .map((c: any) => c.nick);

      const gameService = new GameService(msg.lobbyId, playerNicks);
      games[msg.lobbyId] = gameService;

      // Rozsyłamy stan gry do wszystkich w lobby
      wss.clients.forEach((client: any) => {
        if (client.readyState !== 1 || client.lobbyId !== msg.lobbyId) return;

        // publiczny stan
        const publicState = gameService.getPublicState(client.nick);
        client.send(
          JSON.stringify({ type: "game_state_public", gameState: publicState })
        );

        // prywatny stan (karty gracza)
        const privateHand = gameService.getPrivateHand(client.nick);
        client.send(
          JSON.stringify({ type: "game_state_private", hand: privateHand })
        );

        logger.info(`[START_GAME] Wysłano game_state do: ${client.nick}`);
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

      // TODO: implementacja hit/stand/double itp.
      logger.info(
        `[PLAYER_ACTION] Akcja od ${ws.nick} w lobby ${
          msg.lobbyId
        }: ${JSON.stringify(msg.action)}`
      );

      // przykładowo po akcji można odświeżyć public/private state
      wss.clients.forEach((client: any) => {
        if (client.readyState !== 1 || client.lobbyId !== msg.lobbyId) return;
        client.send(
          JSON.stringify({
            type: "game_state_public",
            gameState: service.getPublicState(client.nick),
          })
        );
        client.send(
          JSON.stringify({
            type: "game_state_private",
            hand: service.getPrivateHand(client.nick),
          })
        );
      });
      break;

    default:
      logger.warn(
        `[GAME_MESSAGE] Nieobsługiwany typ wiadomości: ${msg.type} od ${ws.nick}`
      );
  }
};
