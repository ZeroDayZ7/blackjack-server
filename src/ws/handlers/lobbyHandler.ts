import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import * as LobbyActions from './lobby/index.js';

export async function routeLobbyMessage(ws: MyWebSocket, wss: Server, msg: LobbyMessage) {
  switch (msg.type) {
    case 'create_lobby':
      return LobbyActions.handleCreateLobby(ws, wss, msg);
    case 'join_lobby':
      return LobbyActions.handleJoinLobby(ws, wss, msg);
    case 'leave_lobby':
      return LobbyActions.handleLeaveLobby(ws, wss, msg);
    case 'ping_lobbies':
      return LobbyActions.handlePingLobbies(ws, wss);
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown lobby type: ${msg.type}` }));
      break;
  }
}
