// handlers/game/commandHandler.ts
import type { Server, WebSocket } from 'ws';
import type { MyWebSocket, GameMessage } from '@types';
import { z } from 'zod';
import logger from '@logger';
import { dataStore } from '@ws/data/transactionalDataStore.js';
import { GameValidationError } from '@utils/errors/gameValidationError.js';
import type { CommandResult } from './types.js';

export abstract class GameCommand<T extends GameMessage = GameMessage> {
  abstract readonly schema: z.ZodSchema<T>;
  abstract readonly requiresGame: boolean;
  abstract readonly requiresHost: boolean;
  abstract readonly type: string;

  constructor(protected readonly ws: MyWebSocket, protected readonly wss: Server, protected readonly message: T) {}

  async execute(): Promise<CommandResult> {
    try {
      this.validatePermissions();
      const validated = this.validateInput();
      return await this.handle(validated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private validateInput(): T {
    const result = this.schema.safeParse(this.message);
    if (!result.success) {
      throw new GameValidationError('Invalid input', {
        issues: result.error.issues,
        input: this.message,
      });
    }
    return result.data;
  }

  private validatePermissions() {
    if (this.requiresHost && this.ws.nick !== this.getHost()) {
      throw new GameValidationError('Only host can perform this action');
    }
  }

  protected abstract handle(validated: T): Promise<CommandResult>;

  protected getHost(): string | null {
    // Implement in concrete classes
    throw new Error('Not implemented');
  }

  protected getGame(lobbyId: string): GameService {
    const game = dataStore.getGame(lobbyId);
    if (!game) {
      throw new GameValidationError('Game not found');
    }
    return game;
  }

  private handleError(error: unknown): CommandResult {
    const message = error instanceof GameValidationError ? error.message : 'Internal server error';

    logger.error(`[COMMAND_ERROR] ${this.type}`, {
      error,
      nick: this.ws.nick,
      lobbyId: this.message.lobbyId,
      details: error instanceof GameValidationError ? error.details : undefined,
    });

    this.ws.send(
      JSON.stringify({
        type: 'error',
        message,
        ...(error instanceof GameValidationError && error.details ? { details: error.details } : {}),
      }),
    );

    return { success: false, error: message };
  }

  protected emitEvent(event: string, data: any) {
    dataStore.emit(event, { ...data, source: this.type, timestamp: Date.now() });
  }
}

export class LeaveGameCommand extends GameCommand<LeaveGameInput> {
  readonly schema = LeaveGameSchema;
  readonly requiresGame = false;
  readonly requiresHost = false;
  readonly type = 'leave_game';

  protected async handle(validated: LeaveGameInput): Promise<CommandResult> {
    const { lobbyId, nick } = validated;

    await dataStore.transactional(
      async (store) => {
        const lobbyMeta = store.getLobby(lobbyId);
        if (!lobbyMeta) {
          throw new GameValidationError('Lobby not found');
        }

        const lobby = { ...lobbyMeta.lobby };
        const wasHost = lobby.host === nick;
        const game = store.getGame(lobbyId);

        // Immutable update
        const newPlayers = lobby.players.filter((p) => p !== nick);
        const newHost =
          wasHost && newPlayers.length > 0 ? newPlayers.find((p) => !p.startsWith('Bot')) || newPlayers[0] : lobby.host;

        const updatedLobby = {
          ...lobby,
          players: newPlayers,
          host: newHost,
        };

        // Update lobby
        if (
          !store.updateLobby(lobbyId, () => ({
            lobby: updatedLobby,
            lastActive: Date.now(),
            version: lobbyMeta.version + 1,
          }))
        ) {
          throw new GameValidationError('Failed to update lobby');
        }

        // Remove from game if exists
        if (game) {
          game.removePlayer(nick, this.wss);
          store.deleteGame(lobbyId);
        }

        // Remove empty lobby
        const humanPlayers = newPlayers.filter((p) => !p.startsWith('Bot'));
        if (humanPlayers.length === 0) {
          store.deleteLobby(lobbyId);
        }

        // Send confirmation
        this.ws.send(
          JSON.stringify({
            type: 'left_game',
            lobbyId,
            wasHost,
            newHost,
          }),
        );

        this.emitEvent('player_left', { lobbyId, nick, wasHost });

        // Trigger lobby broadcast
        this.wss.emit('lobby_update', { lobbyId });

        return { success: true, data: { lobbyId, newHost } };
      },
      { type: 'lobby' },
    );

    return { success: true };
  }

  protected getHost(): string {
    return ''; // Not needed for this command
  }
}

// Command registry
const commandRegistry = new Map<string, new () => GameCommand>();
commandRegistry.set('leave_game', LeaveGameCommand);

export function createCommand(type: string, ws: MyWebSocket, wss: Server, message: GameMessage): GameCommand | null {
  const CommandClass = commandRegistry.get(type);
  return CommandClass ? new CommandClass(ws, wss, message) : null;
}
