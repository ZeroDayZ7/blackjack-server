export interface Card {
  suit: 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades';
  value: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
}

export type PlayerStatus =
  | 'waiting'      // czeka na swoją kolej / start gry
  | 'player_turn'  // aktywny ruch gracza
  | 'stand'        // zatrzymał się
  | 'bust'         // przekroczył 21
  | 'blackjack'    // naturalny blackjack
  | 'double';      // podwojenie stawki

export type PlayerAction = 'hit' | 'stand' | 'double' | 'split';

export type PlayerResult = 'win' | 'lose' | 'push' | 'blackjack' | null;

export interface PlayerState {
  nick: string;
  hand: Card[];
  score: number;
  status: PlayerStatus;  // bieżący stan w trakcie gry
  result: PlayerResult;  // wynik po zakończeniu rundy
  bet: number;
  balance: number;
}


export interface DealerState {
  hand: Card[];
  score: number;
}

export type GameStatus = 'waiting_for_players' | 'player_turn' | 'dealer_turn' | 'finished';

export interface GameState {
  lobbyId: string;
  players: Record<string, PlayerState>;
  dealer: DealerState;
  currentPlayerNick: string | null;
  gameStatus: GameStatus;
  winner: string | 'push' | null;
  deck: Card[];
}
