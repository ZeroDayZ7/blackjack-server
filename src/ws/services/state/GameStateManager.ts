// src/game/state/GameStateManager.ts
import type { GameState } from '@types';
import { RoundManager } from './RoundManager.js';
import { PlayerManager } from './PlayerManager.js';
import { DealerManager } from './DealerManager.js';
import { generateDeck } from '../logic/deck.js';
import logger from '@logger';

export class GameStateManager {
  private state: GameState;
  public roundManager: RoundManager;
  public playerManager: PlayerManager;
  public dealerManager: DealerManager;

  constructor(lobbyId: string, playerNicks: string[]) {
    // Inicjalizacja PlayerManager
    this.playerManager = new PlayerManager();
    playerNicks.forEach((nick) => this.playerManager.addPlayer(nick));

    // Inicjalizacja DealerManager
    this.dealerManager = new DealerManager();

    // Inicjalizacja stanu gry
    this.state = {
      lobbyId,
      players: this.playerManager.getAllPlayers(),
      dealer: { hand: [], score: 0 },
      currentPlayerNick: playerNicks[0] || null,
      gameStatus: 'player_turn',
      winner: null,
      deck: generateDeck(),
    };

    // Inicjalizacja RoundManager
    this.roundManager = new RoundManager(this.state, this.dealerManager);
  }

  /** Pobranie pełnego stanu gry */
  public getState(): GameState {
    return this.state;
  }

  /** Reset gry (przy nowej rundzie lub restarcie lobby) */
  public resetGame() {
    // Reset graczy
    this.playerManager.getAllPlayers(); // można dodać reset wewnątrz PlayerManager

    // Reset dealera
    this.dealerManager.resetHand();

    // Nowa talia
    this.state.deck = generateDeck();

    // Reset stanu gry
    this.state.currentPlayerNick = Object.keys(this.state.players)[0] || null;
    this.state.gameStatus = 'player_turn';
    this.state.winner = null;

    // Reset rundy
    this.roundManager.resetGame();
  }

  /** Pobranie obecnego gracza */
  public getCurrentPlayer(): string | null {
    return this.state.currentPlayerNick;
  }

  /** Ustawienie zwycięzcy */
  public setWinner(winner: string | 'push') {
    this.state.winner = winner;
  }

  /** Broadcast stanu gry (można integrować z WS) */
  public broadcastGameState(wss: any) {
    const publicState = this.getPublicState();

    wss.clients.forEach((c: any) => {
      if (c.readyState === 1 && c.lobbyId === this.state.lobbyId) {
        c.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));

        const playerState = this.playerManager.getPlayer(c.nick);
        if (playerState) c.send(JSON.stringify({ type: 'game_state_private', playerState }));
      }
    });
  }

  /** Publiczny widok stanu gry */
  public getPublicState() {
    const { players, lobbyId, currentPlayerNick, gameStatus, winner } = this.state;

    return {
      lobbyId,
      currentPlayerNick,
      gameStatus,
      winner,
      players: Object.fromEntries(
        Object.entries(players).map(([nick, p]) => [
          nick,
          {
            hand: p.hand,
            score: p.score,
            status: p.status,
            bet: p.bet,
            balance: p.balance,
          },
        ]),
      ),
      dealer: this.getDealerPublicState(),
    };
  }

  /** Widok publiczny dealera */
  private getDealerPublicState() {
    const { gameStatus } = this.state;

    const hand = this.dealerManager.getHand(gameStatus === 'player_turn');
    const score = this.dealerManager.getScore(gameStatus !== 'player_turn');

    return { hand, score };
  }
}
