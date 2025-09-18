import type { MyWebSocket } from '@types';
import { PingLobbiesInput } from '@utils/validator/index.js';
import { validateMessage } from '@utils/wsValidators.js';
import { sendLobbyListTo } from '@ws/services/transport/BroadcasterLobby.js';

export async function handlePingLobbies(ws: MyWebSocket, msg?: any) {
  if (msg?.type) {
    const validated = validateMessage(ws, msg) as PingLobbiesInput | null;
    if (!validated) return;
  }
  sendLobbyListTo(ws);
}
