import type { Lobby } from '../types/index.js';
import { GameService } from '../services/gameService.js';
import { Mutex } from 'async-mutex';
import { RateLimiterMemory } from 'rate-limiter-flexible';

interface LobbyWithMeta {
  lobby: Lobby;
  lastActive: number;
}

interface GameWithMeta {
  game: GameService;
  lastActive: number;
}

export class DataStore {
  private lobbies: LobbyWithMeta[] = [];
  private games: Record<string, GameWithMeta> = {};
  private mutex = new Mutex();
  private cleanupInterval: NodeJS.Timeout;

  MAX_LOBBIES = 50;
  MAX_GAMES = 50;

  private lobbyLimiter = new RateLimiterMemory({
    points: 5,
    duration: 10,
  });

  private gameLimiter = new RateLimiterMemory({
    points: 5,
    duration: 10,
  });

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async withLock<T>(operation: () => Promise<T> | T): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  getLobbies(): Lobby[] {
    return this.lobbies.map((l) => l.lobby);
  }

  getGame(lobbyId: string): GameService | undefined {
    return this.games[lobbyId]?.game;
  }

  getGames(): Record<string, GameService> {
    const result: Record<string, GameService> = {};
    for (const id in this.games) {
      result[id] = this.games[id].game;
    }
    return result;
  }

  async addLobby(lobby: Lobby) {
    await this.withLock(async () => {
      if (this.lobbies.length >= this.MAX_LOBBIES) {
        throw new Error('Too many active lobbies');
      }
      this.lobbies.push({ lobby, lastActive: Date.now() });
    });
  }

  async removeLobby(lobbyId: string) {
    await this.withLock(() => {
      this.lobbies = this.lobbies.filter((l) => l.lobby.id !== lobbyId);
    });
  }

  async addGame(lobbyId: string, game: GameService, ip: string) {
    await this.gameLimiter.consume(ip);

    if (Object.keys(this.games).length >= this.MAX_GAMES) {
      throw new Error('Too many active games');
    }

    this.games[lobbyId] = { game, lastActive: Date.now() };
  }

  removeGame(lobbyId: string) {
    delete this.games[lobbyId];
  }

  async touchLobby(lobbyId: string) {
    await this.withLock(() => {
      const l = this.lobbies.find((l) => l.lobby.id === lobbyId);
      if (l) l.lastActive = Date.now();
    });
  }

  touchGame(lobbyId: string) {
    if (this.games[lobbyId]) this.games[lobbyId].lastActive = Date.now();
  }

  private cleanup() {
    this.withLock(() => {
      const now = Date.now();
      const TTL = 30 * 60 * 1000;
      this.lobbies = this.lobbies.filter((l) => now - l.lastActive < TTL);
      for (const id of Object.keys(this.games)) {
        if (now - this.games[id].lastActive >= TTL) {
          delete this.games[id];
        }
      }
    });
  }

  shutdown() {
    clearInterval(this.cleanupInterval);
  }
}

export const dataStore = new DataStore();
