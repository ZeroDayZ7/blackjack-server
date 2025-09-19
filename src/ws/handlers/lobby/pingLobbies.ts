import type { MyWebSocket } from '@types';
import { PingLobbiesInput } from '@utils/validator/index.js';
import { sendLobbyListTo } from '@ws/services/transport/BroadcasterLobby.js';
import type { Server } from 'ws';
import logger from '@logger';

/**
 * Handle ping_lobbies message
 */
export async function handlePingLobbies(ws: MyWebSocket, _wss: Server, msg: PingLobbiesInput) {
  logger.debug('[handlePingLobbies] Called', { nick: ws.nick, msg });

  try {
    sendLobbyListTo(ws);
    logger.info('[handlePingLobbies] Lobby list sent successfully', { nick: ws.nick });
  } catch (err) {
    logger.error('[handlePingLobbies] Error sending lobby list', { nick: ws.nick, err });
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to send lobby list' }));
  }
}
