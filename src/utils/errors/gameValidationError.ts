// utils/errors/gameValidationError.ts
export class GameValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: {
      issues?: Array<{ code: string; message: string; path: string[] }>;
      input?: any;
      context?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'GameValidationError';
  }
}