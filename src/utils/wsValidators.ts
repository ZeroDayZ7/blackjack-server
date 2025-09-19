import type { MyWebSocket } from '@types';
import { ZodType } from 'zod';

type SchemasMap<T extends { type: string }> = Record<string, ZodType<T>>;

export function validateMessage<T extends { type: string }>(ws: MyWebSocket, msg: T, schemas: SchemasMap<T>): T | null {
  const schema = schemas[msg.type];
  if (!schema) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown action type: ${msg.type}` }));
    return null;
  }

  const dataToValidate = { ...msg, nick: ws.nick ?? (msg as any).nick ?? '' };
  const parsed = schema.safeParse(dataToValidate);

  if (!parsed.success) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: `Invalid ${msg.type} data`,
        details: parsed.error.issues,
      }),
    );
    return null;
  }

  return parsed.data as T;
}
