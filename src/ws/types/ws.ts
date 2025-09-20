import { ConnectionMetadata } from '@ws/connectionManager.js';
import type { WebSocket } from 'ws';

type LobbyMessageType = 'create_lobby' | 'join_lobby' | 'leave_lobby' | 'ping_lobbies';
type Actions = 'hit' | 'double' | 'stand';

type GameMessageType =
  | 'start_game'
  | 'player_action'
  | 'subscribe_to_game'
  | 'player_ready'
  | 'restart_game'
  | 'leave_game';

interface BaseMessage<T = any> {
  payload?: T;
  nick?: string;
  lobbyId: string;
  lobbyName: string;
}

export interface GameMessage<T = any> extends BaseMessage<T> {
  type: GameMessageType;
  gameState?: any;
  playerState?: any;
  action?: Actions;
  message?: string;
}

export interface LobbyMessage<T = any> extends BaseMessage<T> {
  type: LobbyMessageType;
  nick: string;
  useBots: boolean;
  maxPlayers: number;
}
export type WsMessage = LobbyMessage | GameMessage;

export interface MyWebSocket extends WebSocket {
  nick?: string;
  lobbyId?: string;
  inGame?: boolean;
  connectedAt?: Date;
  connectionId: string;
  metadata: ConnectionMetadata;
  updateActivity: () => void;
  recordError: () => void;
  isActive: boolean;
  getLatency: () => number;
}
