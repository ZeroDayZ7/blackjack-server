import logger from '@logger';
import { z } from 'zod';
import { ActionInput, ActionSchema } from '../utils/validator.js';
import { GameMessage, LobbyMessage, MyWebSocket } from '@types';

export function validateAction(ws: MyWebSocket, msg: GameMessage | LobbyMessage): ActionInput | null {
  const parsed = ActionSchema.safeParse({
    lobbyId: msg?.lobbyId,
    lobbyName: msg?.lobbyName,
    nick: ws.nick,
  });

  if (!parsed.success) {
    logger.warn('[LobbyValidation] Missing or invalid data', {
      errors: z.treeifyError(parsed.error),
    });
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Invalid lobby action data',
        details: parsed.error.issues,
      }),
    );
    return null;
  }

  // Dodatkowa walidacja - albo lobbyId albo lobbyName
  if (!parsed.data.lobbyId && !parsed.data.lobbyName) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Either lobbyId or lobbyName is required',
      }),
    );
    return null;
  }

  return parsed.data;
}