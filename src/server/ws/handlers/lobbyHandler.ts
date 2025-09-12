// ws/handlers/lobbyHandler.ts
import { lobbies } from "../../../data/lobbies.js";

export const handleLobbyMessage = (ws: any, wss: any, msg: any) => {
  if (msg.type === "joined_lobby") {
    ws.lobbyId = msg.lobbyId;

    // broadcast tylko do tego lobby
    wss.clients.forEach((client: any) => {
      if (client.readyState === 1 && client.lobbyId === msg.lobbyId) {
        client.send(
          JSON.stringify({ type: "lobby_update", lobbyId: msg.lobbyId })
        );
      }
    });
  }

  if (msg.type === "ping_lobbies") {
    wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "lobby_list_update", lobbies }));
      }
    });
  }
};
