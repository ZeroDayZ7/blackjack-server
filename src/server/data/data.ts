// src/data/lobbies.ts
import type { Lobby } from "@ws/types/index.js";
import { GameService } from "../ws/services/gameService.js";

export const lobbies: Lobby[] = [];
export const games: Record<string, GameService> = {};