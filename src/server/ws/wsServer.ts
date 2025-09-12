import { Server as HttpServer } from "http";
import { Server, WebSocketServer } from "ws";
import { handleLobbyMessage } from "./handlers/lobbyHandler.js";
import { handleGameMessage } from "./handlers/gameHandler.js";

export const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: any) => {
    console.log("New WS connection");

    ws.on("message", (msg: string) => {
      let data;
      try {
        data = JSON.parse(msg);
      } catch {
        return;
      }

      switch (data.type) {
        case "joined_lobby":
        case "ping_lobbies":
        case "lobby_update":
          handleLobbyMessage(ws, wss, data);
          break;
        case "start_game":
        case "player_action":
          handleGameMessage(ws, wss, data);
          break;
        default:
          console.warn("Unknown WS message type:", data.type);
      }
    });

    ws.on("close", () => console.log("Client disconnected"));
  });

  return wss;
};
