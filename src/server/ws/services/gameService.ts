import type { GameState, PlayerState } from "@ws/types/index.js";
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
        status: "waiting",
        bet: 0,
        balance: 1000, // startowy balans
      };
    });

    const dealer = { hand: [deck.pop()!, deck.pop()!], score: 0 };

    this.state = {
      lobbyId,
      players: playerHands,
      dealer,
      currentPlayerNick: players[0],
      gameStatus: "player_turn",
      winner: null,
      deck,
    };
  }

  getState(): GameState {
    return this.state;
  }

  getPublicState(forNick: string) {
    const { players, dealer, lobbyId, currentPlayerNick, gameStatus, winner } =
      this.state;
    return {
      lobbyId,
      players: Object.fromEntries(
        Object.entries(players).map(([n, p]) => [
          n,
          { score: p.score, status: p.status },
        ])
      ),
      dealer: { hand: ["?", dealer.hand[1]], score: dealer.score },
      currentPlayerNick,
      gameStatus,
      winner,
    };
  }

  getPrivateHand(nick: string) {
    return this.state.players[nick].hand;
  }

  // TODO: metody typu hit(), stand(), double(), updateScores(), nextTurn(), endGame()
}
