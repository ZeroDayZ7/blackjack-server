// data/transactionalDataStore.ts
import type { Lobby } from '../types/index.js';
import { GameService } from '../services/gameService.js';
import { Mutex } from 'async-mutex';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { EventEmitter } from 'events';

interface LobbyWithMeta {
  lobby: Lobby;
  lastActive: number;
  version: number; // Optimistic locking
}

interface GameWithMeta {
  game: GameService;
  lastActive: number;
  version: number;
}

export interface DataStoreEvent {
  type: 'lobby_added' | 'lobby_removed' | 'game_added' | 'game_removed';
  data: any;
}

interface StatsOptions {
  includeMemory?: boolean;
}

export class TransactionalDataStore extends EventEmitter {
  private lobbies: Map<string, LobbyWithMeta> = new Map();
  private games: Map<string, GameWithMeta> = new Map();

  private lobbyMutex = new Mutex();
  private gameMutex = new Mutex();

  // Configuration
  private readonly config = {
    MAX_LOBBIES: 100,
    MAX_GAMES: 50,
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    TTL_MS: 30 * 60 * 1000,
  };

  private readonly rateLimiters = {
    lobby: new RateLimiterMemory({
      points: 5,
      duration: 10,
    }),
    game: new RateLimiterMemory({
      points: 3,
      duration: 10,
    }),
  };

  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeCleanup();
  }

  private initializeCleanup() {
    this.cleanupInterval = setInterval(() => this.scheduleCleanup(), this.config.CLEANUP_INTERVAL_MS);
  }

  private async scheduleCleanup() {
    // Używamy obu mutexów w kolejności (lobby -> game) aby uniknąć deadlock
    const lobbyRelease = await this.lobbyMutex.acquire();
    const gameRelease = await this.gameMutex.acquire();

    try {
      await this.cleanupExpiredResources();
    } finally {
      gameRelease(); // Odwrotna kolejność release
      lobbyRelease();
    }
  }

  private async cleanupExpiredResources() {
    const now = Date.now();
    const expiredLobbies: string[] = [];
    const expiredGames: string[] = [];

    // Collect expired resources first (z lockami już nabytymi)
    for (const [id, lobby] of this.lobbies) {
      if (now - lobby.lastActive > this.config.TTL_MS) {
        expiredLobbies.push(id);
      }
    }

    for (const [id, game] of this.games) {
      if (now - game.lastActive > this.config.TTL_MS) {
        expiredGames.push(id);
      }
    }

    // Remove in batch
    for (const id of expiredLobbies) {
      this.lobbies.delete(id);
      this.emit('lobby_removed', { id, reason: 'expired' });
    }

    for (const id of expiredGames) {
      this.games.delete(id);
      this.emit('game_removed', { id, reason: 'expired' });
    }

    if (expiredLobbies.length || expiredGames.length) {
      console.log(`[CLEANUP] Removed ${expiredLobbies.length} lobbies, ${expiredGames.length} games`);
    }
  }

  /**
   * Transactional operation z prawdziwym optimistic locking (CAS)
   */
  async transactional<T>(
    operation: (store: {
      getLobby: (id: string) => LobbyWithMeta | undefined;
      getGame: (id: string) => GameWithMeta | undefined;
      updateLobby: (
        id: string,
        updater: (lobby: LobbyWithMeta) => LobbyWithMeta,
        expectedVersion?: number,
      ) => Promise<boolean>;
      updateGame: (
        id: string,
        updater: (game: GameWithMeta) => GameWithMeta,
        expectedVersion?: number,
      ) => Promise<boolean>;
      createLobby: (lobby: LobbyWithMeta) => Promise<boolean>;
      createGame: (game: GameWithMeta) => Promise<boolean>;
      deleteLobby: (id: string) => Promise<boolean>;
      deleteGame: (id: string) => Promise<boolean>;
    }) => Promise<T>,
    options: { ip?: string; type: 'lobby' | 'game' } = { type: 'lobby' },
  ): Promise<T> {
    const mutex = options.type === 'lobby' ? this.lobbyMutex : this.gameMutex;
    const release = await mutex.acquire();

    try {
      const store = {
        getLobby: (id: string) => this.lobbies.get(id),
        getGame: (id: string) => this.games.get(id),

        updateLobby: async (
          id: string,
          updater: (lobby: LobbyWithMeta) => LobbyWithMeta,
          expectedVersion?: number,
        ): Promise<boolean> => {
          const current = this.lobbies.get(id);
          if (!current) return false;

          // Prawdziwy optimistic lock - sprawdzenie wersji
          if (expectedVersion !== undefined && current.version !== expectedVersion) {
            console.warn(
              `[OPTIMISTIC_LOCK] Version conflict for lobby ${id}. Expected: ${expectedVersion}, Actual: ${current.version}`,
            );
            return false; // Konflikt wersji
          }

          const updated = updater(current);
          this.lobbies.set(id, {
            ...updated,
            version: current.version + 1, // Inkrementacja tylko po udanym CAS
          });
          return true;
        },

        updateGame: async (
          id: string,
          updater: (game: GameWithMeta) => GameWithMeta,
          expectedVersion?: number,
        ): Promise<boolean> => {
          const current = this.games.get(id);
          if (!current) return false;

          // Prawdziwy optimistic lock - sprawdzenie wersji
          if (expectedVersion !== undefined && current.version !== expectedVersion) {
            console.warn(
              `[OPTIMISTIC_LOCK] Version conflict for game ${id}. Expected: ${expectedVersion}, Actual: ${current.version}`,
            );
            return false; // Konflikt wersji
          }

          const updated = updater(current);
          this.games.set(id, {
            ...updated,
            version: current.version + 1, // Inkrementacja tylko po udanym CAS
          });
          return true;
        },

        createLobby: async (lobby: LobbyWithMeta): Promise<boolean> => {
          // Rate limiting z await i obsługą błędów
          if (options.ip) {
            try {
              await this.rateLimiters.lobby.consume(options.ip);
            } catch (error) {
              console.warn(`[RATE_LIMIT] Lobby creation blocked for IP: ${options.ip}`);
              return false;
            }
          }

          if (this.lobbies.size >= this.config.MAX_LOBBIES) {
            console.warn(`[LIMIT] Max lobbies reached: ${this.config.MAX_LOBBIES}`);
            return false;
          }

          // Sprawdzenie czy już istnieje
          if (this.lobbies.has(lobby.lobby.id)) {
            console.warn(`[DUPLICATE] Lobby already exists: ${lobby.lobby.id}`);
            return false;
          }

          this.lobbies.set(lobby.lobby.id, lobby);
          this.emit('lobby_added', lobby);
          return true;
        },

        createGame: async (game: GameWithMeta): Promise<boolean> => {
          // Rate limiting z await i obsługą błędów
          if (options.ip) {
            try {
              await this.rateLimiters.game.consume(options.ip);
            } catch (error) {
              console.warn(`[RATE_LIMIT] Game creation blocked for IP: ${options.ip}`);
              return false;
            }
          }

          if (this.games.size >= this.config.MAX_GAMES) {
            console.warn(`[LIMIT] Max games reached: ${this.config.MAX_GAMES}`);
            return false;
          }

          // Sprawdzenie czy już istnieje
          if (this.games.has(game.game.lobbyId)) {
            console.warn(`[DUPLICATE] Game already exists for lobby: ${game.game.lobbyId}`);
            return false;
          }

          this.games.set(game.game.lobbyId, game);
          this.emit('game_added', game);
          return true;
        },

        deleteLobby: async (id: string): Promise<boolean> => {
          const removed = this.lobbies.delete(id);
          if (removed) {
            this.emit('lobby_removed', { id });
          }
          return removed;
        },

        deleteGame: async (id: string): Promise<boolean> => {
          const removed = this.games.delete(id);
          if (removed) {
            this.emit('game_removed', { id });
          }
          return removed;
        },
      };

      return await operation(store);
    } catch (error) {
      console.error(`[TRANSACTION_ERROR] ${options.type} transaction failed:`, error);
      throw error;
    } finally {
      release();
    }
  }

  // Public API z retry logic dla optimistic locking
  async addLobby(lobby: Lobby, ip?: string): Promise<boolean> {
    return this.transactional(
      async (store) => {
        const success = await store.createLobby({
          lobby,
          lastActive: Date.now(),
          version: 1,
        });

        if (!success) {
          throw new Error('Failed to create lobby - rate limit or max lobbies reached');
        }
        return true;
      },
      { ip, type: 'lobby' },
    ).catch(() => false);
  }

  async removeLobby(lobbyId: string): Promise<boolean> {
    return this.transactional(async (store) => store.deleteLobby(lobbyId), { type: 'lobby' }).catch(() => false);
  }

  async addGame(lobbyId: string, game: GameService, ip?: string): Promise<boolean> {
    return this.transactional(
      async (store) => {
        const success = await store.createGame({
          game,
          lastActive: Date.now(),
          version: 1,
        });

        if (!success) {
          throw new Error('Failed to create game - rate limit or max games reached');
        }
        return true;
      },
      { ip, type: 'game' },
    ).catch(() => false);
  }

  async removeGame(lobbyId: string): Promise<boolean> {
    return this.transactional(async (store) => store.deleteGame(lobbyId), { type: 'game' }).catch(() => false);
  }

  /**
   * Update z optimistic locking i retry logic
   */
  async updateLobbyWithRetry(
    lobbyId: string,
    updater: (lobby: LobbyWithMeta) => LobbyWithMeta,
    maxRetries = 3,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const current = this.lobbies.get(lobbyId);
        if (!current) return false;

        const success = await this.transactional((store) => store.updateLobby(lobbyId, updater, current.version), {
          type: 'lobby',
        });

        if (success) return true;

        // Exponential backoff
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 10));
        }
      } catch (error) {
        console.warn(`[RETRY] Update lobby attempt ${attempt + 1} failed:`, error);
      }
    }

    console.warn(`[OPTIMISTIC_LOCK] Failed to update lobby ${lobbyId} after ${maxRetries} attempts`);
    return false;
  }

  /**
   * Update z optimistic locking i retry logic
   */
  async updateGameWithRetry(
    gameId: string,
    updater: (game: GameWithMeta) => GameWithMeta,
    maxRetries = 3,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const current = this.games.get(gameId);
        if (!current) return false;

        const success = await this.transactional((store) => store.updateGame(gameId, updater, current.version), {
          type: 'game',
        });

        if (success) return true;

        // Exponential backoff
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 10));
        }
      } catch (error) {
        console.warn(`[RETRY] Update game attempt ${attempt + 1} failed:`, error);
      }
    }

    console.warn(`[OPTIMISTIC_LOCK] Failed to update game ${gameId} after ${maxRetries} attempts`);
    return false;
  }

  // Touch methods - proste update z wersjonowaniem
  async touchLobby(lobbyId: string): Promise<boolean> {
    return this.updateLobbyWithRetry(lobbyId, (lobby) => ({
      ...lobby,
      lastActive: Date.now(),
    }));
  }

  async touchGame(gameId: string): Promise<boolean> {
    return this.updateGameWithRetry(gameId, (game) => ({
      ...game,
      lastActive: Date.now(),
    }));
  }

  // Unified snapshot methods
  getLobbiesSnapshot(deepCopy: boolean = true): Lobby[] {
    return Array.from(this.lobbies.values()).map(({ lobby }) => {
      if (deepCopy) {
        // Deep copy dla broadcast - bezpieczny dla serializacji
        return {
          ...lobby,
          players: [...lobby.players], // Deep copy tablicy players
          // Dodaj inne pola wymagające deep copy jeśli potrzebne
        };
      }
      return lobby; // Shallow copy dla wewnętrznego użycia
    });
  }

  // Convenience methods
  getLobbiesForBroadcast(): Lobby[] {
    return this.getLobbiesSnapshot(true);
  }

  getLobbiesForInternalUse(): Lobby[] {
    return this.getLobbiesSnapshot(false);
  }

  getGame(gameId: string): GameService | undefined {
    return this.games.get(gameId)?.game;
  }

  getGamesSnapshot(deepCopy: boolean = false): Record<string, GameService> {
    const snapshot: Record<string, GameService> = {};
    for (const [id, { game }] of this.games) {
      snapshot[id] = deepCopy ? { ...game } : game;
    }
    return snapshot;
  }

  getStats(options: StatsOptions = {}): {
    lobbiesCount: number;
    gamesCount: number;
    memory?: NodeJS.MemoryUsage;
  } {
    const stats: {
      lobbiesCount: number;
      gamesCount: number;
      memory?: NodeJS.MemoryUsage;
    } = {
      lobbiesCount: this.lobbies.size,
      gamesCount: this.games.size,
    };

    if (options.includeMemory) {
      stats.memory = process.memoryUsage();
    }

    return stats;
  }

  // Debug method - pokazuje wersje dla wszystkich zasobów
  getVersionInfo(): {
    lobbies: Record<string, number>;
    games: Record<string, number>;
  } {
    const lobbyVersions: Record<string, number> = {};
    const gameVersions: Record<string, number> = {};

    for (const [id, { version }] of this.lobbies) {
      lobbyVersions[id] = version;
    }

    for (const [id, { version }] of this.games) {
      gameVersions[id] = version;
    }

    return { lobbies: lobbyVersions, games: gameVersions };
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.removeAllListeners();
    console.log('[DATASTORE] Shutdown complete');
  }
}

export const dataStore = new TransactionalDataStore();
