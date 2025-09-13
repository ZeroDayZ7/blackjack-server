import { WebSocket } from "ws";

export interface MyWebSocket extends WebSocket {
  nick?: string;
  lobbyId?: string;
}
