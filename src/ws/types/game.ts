export interface Card {
  suit: 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades';
  value:
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | '10'
    | 'J'
    | 'Q'
    | 'K'
    | 'A';
}

export type PlayerStatus =
  | 'waiting'
  | 'player_turn'
  | 'stand'
  | 'bust'
  | 'blackjack'
  | 'double';

export type PlayerAction = 'hit' | 'stand' | 'double' | 'split';

export type PlayerResult = 'win' | 'lose' | 'push' | 'blackjack' | null;

interface BasePlayer {
  hand: Card[];
  score: number;
}

export interface PlayerState extends BasePlayer {
  nick: string;
  status: PlayerStatus;
  bet: number;
  balance: number;
  result?: PlayerResult;
}

export interface DealerState extends BasePlayer {
  status?: PlayerStatus; // jeśli potrzebujesz
}

export type GameStatus =
  | 'waiting_for_players'
  | 'player_turn'
  | 'dealer_turn'
  | 'finished';

export interface GameState {
  lobbyId: string;
  players: Record<string, PlayerState>;
  dealer: DealerState;
  currentPlayerNick: string | null;
  gameStatus: GameStatus;
  winner: string | 'push' | null;
  deck: Card[];
}
