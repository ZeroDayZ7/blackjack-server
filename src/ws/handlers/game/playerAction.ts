export const handlePlayerAction = (ws: any, wss: any, msg: any, game: any) => {
  if (!msg.action || !ws.nick) return;

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
      return;
  }

  // automatyczne tury botów
  let nextPlayer = game.getCurrentPlayer();
  while (nextPlayer?.startsWith('Bot')) {
    game.advanceTurn(wss);
    nextPlayer = game.getCurrentPlayer();
  }
};
