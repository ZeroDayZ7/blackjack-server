// src/data/lobbies.ts
// import type { Lobby } from "../types/index.js";
// import { GameService } from "../services/gameService.js";

// export const lobbies: Lobby[] = [];
// export const games: Record<string, GameService> = {};

import type { Lobby } from "../types/index.js";
import { GameService } from "../services/gameService.js";

export class DataStore {
  private lobbies: Lobby[] = [];
  private games: Record<string, GameService> = {};
  private lock = false;

  async withLock<T>(operation: () => Promise<T> | T): Promise<T> {
    while (this.lock) await new Promise((resolve) => setTimeout(resolve, 10));
    this.lock = true;
    try {
      return await operation();
    } finally {
      this.lock = false;
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