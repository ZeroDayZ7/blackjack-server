import type {
  GameState,
  PlayerState,
  PlayerStatus,
  Card,
} from "types/index.js";
import { generateDeck } from "./deck.js";

export class GameService {
  private state: GameState;

  constructor(lobbyId: string, players: string[]) {
    const deck = generateDeck();
    const playerHands: Record<string, PlayerState> = {};

    players.forEach((nick) => {
      playerHands[nick] = {
        nick,
        hand: [deck.pop()!, deck.pop()!],
        score: 0,
        status: "waiting" as PlayerStatus,
        bet: 0,
        balance: 1000,
      };
    });

    const dealer = { hand: [deck.pop()!, deck.pop()!], score: 0 };

    this.state = {
      lobbyId,
      players: playerHands,
      dealer,
      currentPlayerNick: players[0] || null,
      gameStatus: "player_turn",
      winner: null,
      deck,
    };
  }

  /** Pełny stan gry (backendowo) */
  getState(): GameState {
    return this.state;
  }

  /** Publiczny stan gry dla wszystkich graczy */
  getPublicState() {
    const { players, dealer, lobbyId, currentPlayerNick, gameStatus, winner } =
      this.state;

    return {
      lobbyId,
      currentPlayerNick,
      gameStatus,
      winner,
      players: Object.fromEntries(
        Object.entries(players).map(([nick, p]) => [
          nick,
          { score: p.score, status: p.status }, // tylko publiczne info
        ])
      ),
      dealer: { hand: ["?", dealer.hand[1]], score: dealer.score }, // zakrywamy pierwszą kartę
    };
  }

  /** Prywatny stan dla konkretnego gracza */
  getPrivateState(nick: string) {
    const player = this.state.players[nick];
    if (!player) return null;

    return {
      hand: player.hand,
      score: player.score,
      status: player.status,
      bet: player.bet,
      balance: player.balance,
    };
  }

  /** Metoda pomocnicza do wyciągania gracza */
  getPlayer(nick: string) {
    return this.state.players[nick] || null;
  }

  // TODO: hit(), stand(), double(), nextTurn(), endGame(), updateScores()
}
