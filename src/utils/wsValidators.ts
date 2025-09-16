// utils/validation.ts
import { MyWebSocket, WsMessage } from '@types';
import logger from '@logger';

export function validateMessage(ws: MyWebSocket, msg: WsMessage): boolean {
  if (!msg.lobbyId || !ws.nick) {
    logger.warn(`[VALIDATION] Missing lobbyId or nick`, { lobbyId: msg.lobbyId, nick: ws.nick });
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return false;
  }
  return true;
}
