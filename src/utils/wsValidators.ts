import logger from '@logger';
import { z } from 'zod';
import { MyWebSocket, LobbyMessage, GameMessage } from '@types';
import { LobbySchemas, GameSchemas } from './validator/index.js';

type Msg = LobbyMessage | GameMessage;

export function validateMessage(ws: MyWebSocket, msg: Msg) {
  // Połączone schematy
  const Schemas: Record<string, z.ZodObject<any>> = {
    ...LobbySchemas,
    ...GameSchemas,
  };

  const schema = Schemas[msg.type];
  if (!schema) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown action type: ${msg.type}` }));
    return null;
  }

  // Dodajemy nick z ws do walidacji
  const dataToValidate = { ...msg, nick: ws.nick || '' };
  const parsed = schema.safeParse(dataToValidate);

  if (!parsed.success) {
    logger.warn(`[Validation:${msg.type}] Invalid data`, { errors: parsed.error.issues });
    ws.send(
      JSON.stringify({
        type: 'error',
        message: `Invalid ${msg.type} data`,
        details: parsed.error.issues,
      }),
    );
    return null;
  }

  return parsed.data; // TS będzie miał typ ZodValidatedOutput
}
