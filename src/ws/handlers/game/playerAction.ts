import { GameMessage, MyWebSocket, WsMessage } from '@types';
import { validateMessage } from '@utils/wsValidators.js';
import { Server } from 'ws';

export const handlePlayerAction = (ws: MyWebSocket, wss: Server, msg: GameMessage, game: any) => {
 if (validateMessage(ws, msg)) return;
  switch (msg.action) {
    case 'hit':
      game.hit(ws.nick, wss);
      break;
    case 'stand':
      game.stand(ws.nick, wss);
      break;
    case 'double':
      game.double(ws.nick, wss);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown action: ${msg.action}` }));
      return;
  }

  // automatyczne tury botów
  let nextPlayer = game.getCurrentPlayer();
  while (nextPlayer?.startsWith('Bot')) {
    game.advanceTurn(wss);
    nextPlayer = game.getCurrentPlayer();
  }
};
