// src/types.ts
export interface Lobby {
  id: string;            // UUID v4
  name: string;          // unikalna nazwa lobby
  players: string[];     // lista nicków graczy
  maxPlayers: number;    // maksymalna liczba graczy
  useBots: boolean;      // czy wypełniać pustki botami
  started: boolean;      // czy gra się rozpoczęła
  host: string;          // nick hosta
}
