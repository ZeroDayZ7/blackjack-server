// src/data/lobbies.ts
import type { Lobby } from "../types/index.js";
import { GameService } from "../services/gameService.js";

export const lobbies: Lobby[] = [];
export const games: Record<string, GameService> = {};