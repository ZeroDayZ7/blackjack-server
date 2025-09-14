export interface Lobby {
  id: string;
  name: string;
  players: string[];
  maxPlayers: number;
  useBots: boolean;
  started: boolean;
  host: string | null;
}
