// middleware/errorHandler.ts
import type { MyWebSocket } from '@types';
import logger from '@logger';
import { GameValidationError } from '../utils/errors/gameValidationError.js';

export class ErrorHandler {
  static handleError(
    error: unknown,
    context: {
      ws: MyWebSocket;
      operation: string;
      lobbyId?: string;
      nick?: string;
    },
  ): never {
    const { ws, operation, lobbyId, nick } = context;

    if (error instanceof GameValidationError) {
      logger.warn(`[VALIDATION_ERROR] ${operation}`, {
        lobbyId,
        nick,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString(),
      });

      ws.send(
        JSON.stringify({
          type: 'validation_error',
          message: error.message,
          operation,
          details:
            error.details?.issues?.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })) || null,
          timestamp: Date.now(),
        }),
      );

      throw error;
    }

    if (error instanceof Error) {
      logger.error(`[GAME_ERROR] ${operation}`, {
        lobbyId,
        nick,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      ws.send(
        JSON.stringify({
          type: 'server_error',
          message: 'An unexpected error occurred',
          operation,
          timestamp: Date.now(),
        }),
      );
    } else {
      logger.error(`[UNKNOWN_ERROR] ${operation}`, {
        lobbyId,
        nick,
        error,
        timestamp: new Date().toISOString(),
      });

      ws.send(
        JSON.stringify({
          type: 'server_error',
          message: 'An unknown error occurred',
          operation,
          timestamp: Date.now(),
        }),
      );
    }

    throw new Error('Unhandled error in error handler');
  }

  static monitorPerformance(operation: string, fn: () => Promise<any>) {
    const start = process.hrtime.bigint();

    return fn().finally(() => {
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000; // ms
      const metrics = {
        operation,
        duration,
        timestamp: Date.now(),
      };

      // Send to metrics collector
      logger.debug('[PERF]', metrics);

      // Alert na wolne operacje
      if (duration > 100) {
        logger.warn('[PERF_SLOW]', { ...metrics, threshold: 100 });
      }
    });
  }
}
