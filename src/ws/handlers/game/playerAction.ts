import { GameMessage, MyWebSocket } from '@types';
import { Server } from 'ws';
import logger from '@logger';

export const handlePlayerAction = (ws: MyWebSocket, wss: Server, msg: GameMessage, game: any) => {
  logger.info(`[handlePlayerAction] received action: ${msg.action} from socket nick=${ws.nick || 'undefined'}`);
  logger.debug(`[handlePlayerAction] raw message: ${JSON.stringify(msg)}`);

  const { lobbyId } = msg;
  if (!lobbyId || !ws.nick) {
    logger.warn('[handleLeaveGame] Missing lobbyId or nick', { lobbyId, nick: ws.nick });
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId or nick' }));
    return;
  }

  if (!game) {
    logger.error(`[handlePlayerAction] no game instance found for lobbyId=${msg.lobbyId}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
    return;
  }

  const currentPlayer = game.getCurrentPlayer();
  if (currentPlayer !== ws.nick) {
    logger.warn(`[handlePlayerAction] Not your turn: ${ws.nick} vs ${currentPlayer}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
    return;
  }

  switch (msg.action) {
    case 'hit':
      logger.info(`[handlePlayerAction] calling game.hit for nick=${ws.nick}`);
      game.hit(ws.nick, wss);
      break;

    case 'stand':
      logger.info(`[handlePlayerAction] calling game.stand for nick=${ws.nick}`);
      game.stand(ws.nick, wss);
      break;

    case 'double':
      logger.info(`[handlePlayerAction] calling game.double for nick=${ws.nick}`);
      game.double(ws.nick, wss);
      break;

    default:
      logger.warn(`[handlePlayerAction] unknown action: ${msg.action} from nick=${ws.nick}`);
      ws.send(JSON.stringify({ type: 'error', message: `Unknown action: ${msg.action}` }));
      return;
  }
};
