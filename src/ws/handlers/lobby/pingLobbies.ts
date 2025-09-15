import type { MyWebSocket } from '@types';
import { sendLobbyListTo } from '@ws/services/transport/BroadcasterLobby.js';

export async function handlePingLobbies(ws: MyWebSocket) {
  sendLobbyListTo(ws);
}
