import type { Server } from 'ws';
import type { MyWebSocket, LobbyMessage } from '@types';
import * as LobbyHandlers from './lobby/index.js';

const lobbyHandlerMap: Record<string, (ws: MyWebSocket, wss: Server, msg: LobbyMessage) => void | Promise<void>> = {
  create_lobby: LobbyHandlers.handleCreateLobby,
  join_lobby: LobbyHandlers.handleJoinLobby,
  leave_lobby: LobbyHandlers.handleLeaveLobby,
  ping_lobbies: LobbyHandlers.handlePingLobbies,
};

export const routeLobbyMessage = async (ws: MyWebSocket, wss: Server, msg: LobbyMessage) => {
  if (!msg.type) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing message type' }));
    return;
  }

  const handler = lobbyHandlerMap[msg.type];
  if (!handler) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown lobby type: ${msg.type}` }));
    return;
  }

  try {
    await handler(ws, wss, msg);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
    console.error(`[LOBBY_HANDLER_ERROR] ${msg.type} from ${ws.nick}`, err);
  }
};
