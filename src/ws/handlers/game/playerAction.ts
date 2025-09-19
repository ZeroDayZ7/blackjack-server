import { GameMessage, MyWebSocket } from '@types';
import { Server } from 'ws';
import logger from '@logger';
import { z } from 'zod';
import { dataStore } from '@ws/data/data.js';
import { GameService } from '@ws/services/gameService.js';

// --- Schemat walidacji dla PlayerAction ---
export const PlayerActionSchema = z.object({
  type: z.literal('player_action'),
  lobbyId: z.uuid(),
  action: z.enum(['hit', 'stand', 'double']),
  nick: z.string().min(1),
});

export type PlayerActionInput = z.infer<typeof PlayerActionSchema>;

export const handlePlayerAction = (ws: MyWebSocket, wss: Server, msg: GameMessage) => {
  // --- Walidacja wejścia ---
  const parsed = PlayerActionSchema.safeParse({ ...msg, nick: ws.nick ?? msg.nick });
  if (!parsed.success) {
    logger.warn('[handlePlayerAction] Validation failed', parsed.error.issues);
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid player_action data', details: parsed.error.issues }));
    return;
  }

  const validated: PlayerActionInput = parsed.data;
  logger.info(`[handlePlayerAction] validated action: ${validated.action} from nick=${validated.nick}`);
  logger.debug(`[handlePlayerAction] raw message: ${JSON.stringify(validated)}`);

  const game = dataStore.getGame(validated.lobbyId) as GameService;

  if (!game) {
    logger.error(`[handlePlayerAction] no game instance found for lobbyId=${validated.lobbyId}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
    return;
  }

  const currentPlayer = game.getCurrentPlayer();
  if (currentPlayer !== validated.nick) {
    logger.warn(`[handlePlayerAction] Not your turn: ${validated.nick} vs ${currentPlayer}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
    return;
  }

  // --- Obsługa akcji ---
  switch (validated.action) {
    case 'hit':
      logger.info(`[handlePlayerAction] calling game.hit for nick=${validated.nick}`);
      game.hit(validated.nick, wss);
      break;
    case 'stand':
      logger.info(`[handlePlayerAction] calling game.stand for nick=${validated.nick}`);
      game.stand(validated.nick, wss);
      break;
    case 'double':
      logger.info(`[handlePlayerAction] calling game.double for nick=${validated.nick}`);
      game.double(validated.nick, wss);
      break;
    default:
      // to nie powinno się zdarzyć, bo Zod już waliduje
      logger.error(`[handlePlayerAction] unknown action: ${validated.action}`);
      ws.send(JSON.stringify({ type: 'error', message: `Unknown action: ${validated.action}` }));
      return;
  }
};
