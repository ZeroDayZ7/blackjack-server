import type { Lobby } from '../types/index.js';
import { GameService } from '../services/gameService.js';
import { Mutex } from 'async-mutex';

export class DataStore {
  private lobbies: Lobby[] = [];
  private games: Record<string, GameService> = {};
  private mutex = new Mutex();

  async withLock<T>(operation: () => Promise<T> | T): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  getLobbies(): Lobby[] {
    return [...this.lobbies];
  }

  getGames(): Record<string, GameService> {
    return { ...this.games };
  }

  addLobby(lobby: Lobby) {
    this.lobbies.push(lobby);
  }

  removeLobby(lobbyId: string) {
    this.lobbies = this.lobbies.filter((l) => l.id !== lobbyId);
  }

  addGame(lobbyId: string, game: GameService) {
    this.games[lobbyId] = game;
  }

  removeGame(lobbyId: string) {
    delete this.games[lobbyId];
  }
}

export const dataStore = new DataStore();
