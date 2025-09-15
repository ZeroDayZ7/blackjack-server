import type { WebSocket } from 'ws';

export type LobbyMessageType = 'create_lobby' | 'join_lobby' | 'leave_lobby' | 'ping_lobbies';

export type GameMessageType =
  | 'start_game'
  | 'player_action'
  | 'subscribe_to_game'
  | 'player_ready'
  | 'restart_game'
  | 'leave_game';

interface BaseMessage<T = any> {
  type: string;
  payload?: T;
  nick?: string;
  lobbyId: string;
}

export interface GameMessage<T = any> extends BaseMessage<T> {
  type: GameMessageType;
  gameState?: any;
  playerState?: any;
  action?: any;
  message?: string;
}

export interface LobbyMessage<T = any> extends BaseMessage<T> {
  type: LobbyMessageType;
  lobbyName: string;
  nick: string;
  useBots: boolean;
  maxPlayers?: number;
}
export type WsMessage = LobbyMessage | GameMessage;

export interface MyWebSocket extends WebSocket {
  nick?: string;
  lobbyId?: string;
}
