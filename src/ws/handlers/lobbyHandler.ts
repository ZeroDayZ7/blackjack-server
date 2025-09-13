import { lobbies } from "@ws/data/data.js";
import { MyWebSocket } from "types/index.js";
import logger from "@logger";

export const handleLobbyMessage = (ws: MyWebSocket, wss: any, msg: any) => {
  switch (msg.type) {
    case "create_lobby":
      logger.info(`[CREATE_LOBBY] Próba utworzenia lobby przez: ${msg.nick}`);

      const existingLobby = lobbies.find((l) => l.players.includes(msg.nick));
      if (existingLobby) {
        logger.warn(
          `[CREATE_LOBBY] ${msg.nick} jest już w lobby ${existingLobby.id}`
        );
        ws.send(
          JSON.stringify({
            type: "error",
            message: "You are already in a lobby",
          })
        );
        return;
      }

      const newLobby = {
        id: crypto.randomUUID(),
        name: msg.lobbyName,
        players: [msg.nick],
        maxPlayers: msg.maxPlayers || 2,
        useBots: msg.useBots ?? true,
        started: false,
        host: msg.nick,
      };
      lobbies.push(newLobby);
      logger.info(
        `[CREATE_LOBBY] Lobby utworzone: ${JSON.stringify(newLobby, null, 2)}`
      );

      ws.lobbyId = newLobby.id;
      ws.nick = msg.nick;

      ws.send(
        JSON.stringify({
          type: "joined_lobby",
          nick: msg.nick,
          lobby: newLobby,
        })
      );
      logger.info(`[CREATE_LOBBY] Wysłano joined_lobby do twórcy: ${msg.nick}`);

      broadcastLobbyList(wss);
      logger.info(`[CREATE_LOBBY] Wysłano broadcastLobbyList do wszystkich`);
      break;

    case "join_lobby":
      logger.info(
        `[JOIN_LOBBY] Próba dołączenia: ${msg.nick} do lobby: ${msg.lobbyId}`
      );

      const lobbyToJoin = lobbies.find((l) => l.id === msg.lobbyId);
      if (!lobbyToJoin) {
        logger.warn(`[JOIN_LOBBY] Lobby ${msg.lobbyId} nie istnieje`);
        ws.send(JSON.stringify({ type: "error", message: "Lobby not found" }));
        return;
      }

      if (lobbyToJoin.players.includes(msg.nick)) {
        logger.warn(`[JOIN_LOBBY] ${msg.nick} już jest w lobby ${msg.lobbyId}`);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "You are already in this lobby",
          })
        );
        return;
      }

      lobbyToJoin.players.push(msg.nick);
      ws.lobbyId = lobbyToJoin.id;
      ws.nick = msg.nick;

      logger.info(`[JOIN_LOBBY] ${msg.nick} dołączył do lobby: ${msg.lobbyId}`);
      logger.info(
        `[JOIN_LOBBY] Aktualni gracze: ${JSON.stringify(lobbyToJoin.players)}`
      );

      // wysyłamy pełny stan lobby do wszystkich w lobby
      broadcastLobbyUpdate(wss, lobbyToJoin);
      logger.info(
        `[JOIN_LOBBY] Wysłano broadcastLobbyUpdate dla lobby: ${msg.lobbyId}`
      );

      ws.send(
        JSON.stringify({
          type: "joined_lobby",
          nick: msg.nick,
          lobby: lobbyToJoin,
        })
      );
      logger.info(
        `[JOIN_LOBBY] Wysłano joined_lobby do dołączającego: ${msg.nick}`
      );
      break;

    case "leave_lobby":
      logger.info(`[LEAVE_LOBBY] ${msg.nick} opuszcza lobby: ${msg.lobbyId}`);

      const leaveLobby = lobbies.find((l) => l.id === msg.lobbyId);
      if (!leaveLobby) {
        logger.warn(`[LEAVE_LOBBY] Nie znaleziono lobby ${msg.lobbyId}`);
        return;
      }

      logger.info(
        `[LEAVE_LOBBY] Przed opuszczeniem gracze: ${JSON.stringify(
          leaveLobby.players
        )}`
      );

      // Usuwamy gracza z listy
      leaveLobby.players = leaveLobby.players.filter((p) => p !== msg.nick);

      // Jeśli opuszczający był hostem i są inni gracze, wybieramy nowego hosta
      if (leaveLobby.host === msg.nick && leaveLobby.players.length > 0) {
        leaveLobby.host = leaveLobby.players[0]; // kolejność według tablicy
        logger.info(`[LEAVE_LOBBY] Nowy host: ${leaveLobby.host}`);
      }

      logger.info(
        `[LEAVE_LOBBY] Po opuszczeniu gracze: ${JSON.stringify(
          leaveLobby.players
        )}`
      );

      // Jeśli lobby puste, usuwamy je
      if (leaveLobby.players.length === 0) {
        const index = lobbies.findIndex((l) => l.id === leaveLobby.id);
        lobbies.splice(index, 1);
        logger.info(
          `[LEAVE_LOBBY] Lobby ${leaveLobby.id} usunięte (brak graczy)`
        );
      }

      // Broadcast aktualnej listy lobby wszystkim klientom
      broadcastLobbyList(wss);
      logger.info(`[LEAVE_LOBBY] Wysłano broadcastLobbyList`);

      // Broadcast aktualizacji samego lobby dla pozostających graczy
      if (leaveLobby.players.length > 0) {
        broadcastLobbyUpdate(wss, leaveLobby);
        logger.info(
          `[LEAVE_LOBBY] Wysłano broadcastLobbyUpdate dla lobby: ${leaveLobby.id}`
        );
      }

      // Informacja dla opuszczającego gracza
      ws.send(
        JSON.stringify({
          type: "left_lobby",
          lobbyId: msg.lobbyId,
          nick: msg.nick,
        })
      );
      logger.info(`[LEAVE_LOBBY] Wysłano left_lobby do gracza ${msg.nick}`);
      break;

    case "ping_lobbies":
      ws.send(JSON.stringify({ type: "lobby_list_update", lobbies }));
      logger.info(`[PING_LOBBIES] Wysłano lobby_list_update`);
      break;
  }
};

// helpery
function broadcastLobbyList(wss: any) {
  wss.clients.forEach((c: MyWebSocket) => {
    if (c.readyState === c.OPEN)
      c.send(JSON.stringify({ type: "lobby_list_update", lobbies }));
  });
}

function broadcastLobbyUpdate(wss: any, lobby: any) {
  wss.clients.forEach((c: MyWebSocket) => {
    if (c.readyState === c.OPEN && lobby.players.includes(c.nick!)) {
      c.send(JSON.stringify({ type: "lobby_update", lobby }));
    }
  });
}
