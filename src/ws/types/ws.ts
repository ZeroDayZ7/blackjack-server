import type { WebSocket } from "ws";

export type LobbyMessageType = 
  | "create_lobby"
  | "join_lobby"
  | "leave_lobby"
  | "ping_lobbies";

export type GameMessageType =
  | "start_game"
  | "player_action"
  | "subscribe_to_game";

export type WsMessageType = LobbyMessageType | GameMessageType;

export interface WsMessage<T = any> {
  type: WsMessageType | string;
  payload?: T;
  lobbyId?: string;
  nick?: string;
  gameState?: any;
  playerState?: any;
  action?: any;
  message?: string;
}

export interface MyWebSocket extends WebSocket {
  nick?: string;
  lobbyId?: string;
}
