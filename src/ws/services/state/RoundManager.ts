import type { GameState, PlayerState, Card } from '@types';
import { generateDeck } from '../logic/deck.js';
import { calculateScore } from '../logic/score.js';
import logger from '@logger';
import { DealerManager } from './DealerManager.js';
import { Server } from 'ws';
import { botDecision, updateBotStatus } from '../logic/bot.js';

export class RoundManager {
  private state: GameState;
  private readyPlayers: Set<string> = new Set();
  private allPlayersReady = false;
  private countdownTimer: NodeJS.Timeout | null = null;
  private roundInProgress = false;
  private dealerManager: DealerManager;

  constructor(state: GameState, dealerManager: DealerManager) {
    this.state = state;
    this.dealerManager = dealerManager;
  }

  /** START/END ROUNDS */

  public startRound(players: Record<string, PlayerState>) {
    this.startNextRound();
  }

  public endRound(players: Record<string, PlayerState>) {
    this.roundInProgress = false;
    // tu można wyliczyć zwycięzców lub wykonać cleanup
  }

  /** TURN MANAGEMENT */

  public advanceTurn(wss?: any) {
    const players = Object.values(this.state.players);
    const currentIndex = players.findIndex((p) => p.nick === this.state.currentPlayerNick);

    for (let i = currentIndex + 1; i < players.length; i++) {
      if (players[i].status === 'waiting') {
        this.state.currentPlayerNick = players[i].nick;

        if (players[i].nick.startsWith('Bot')) {
          this.playBot(players[i].nick, wss);
          return;
        }

        if (wss) this.broadcastGameState?.(wss);
        return;
      }
    }

    this.state.currentPlayerNick = null;
    this.state.gameStatus = 'dealer_turn';
    logger.info(`[TURN] Current player: ${this.state.currentPlayerNick}`);

    if (wss) this.broadcastGameState?.(wss);
    this.playDealer(wss);
  }

  public isPlayerReady(nick: string): boolean {
    return this.readyPlayers.has(nick);
  }

  public getCurrentPlayer(): string | null {
  return this.state.currentPlayerNick;
}


  /** PLACEHOLDER METHODS */

  private playBot(nick: string, wss?: Server) {
    const player = this.state.players[nick];
    if (!player) return;

    const dealerUpCard = this.dealerManager.getHand(false)[0]; // Pobierz odkrytą kartę dealera
    const decision = botDecision(player, dealerUpCard);
    logger.info(`[BOT] Bot ${nick} decided to ${decision}`);

    if (decision === 'hit' || decision === 'double') {
      const card = this.state.deck.pop();
      if (card) {
        if (decision === 'hit') {
          this.state.players[nick].hand.push(card);
        } else {
          this.state.players[nick].balance -= player.bet;
          this.state.players[nick].bet *= 2;
          this.state.players[nick].hand.push(card);
          this.state.players[nick].status = 'stand';
        }
        this.state.players[nick].score = calculateScore(player.hand);
        updateBotStatus(player);
      }
    } else {
      this.state.players[nick].status = 'stand';
    }

    if (wss) this.broadcastGameState?.(wss);
  }

  private playDealer(wss?: any) {
    // minimal placeholder
    logger.info(`[DEALER] Dealer turn started`);
  }

  public broadcastGameState?(wss: any) {
    // optional – można nadpisać z GameService
  }

  /** READY MANAGEMENT */
  public playerReady(nick: string) {
    if (nick.startsWith('Bot')) return;

    this.readyPlayers.add(nick);

    const humanPlayers = Object.keys(this.state.players).filter((n) => !n.startsWith('Bot'));

    if (this.readyPlayers.size >= humanPlayers.length) {
      this.allPlayersReady = true;
      this.clearReady();
      this.startNextRound();
    }
  }

  public resetReady() {
    this.readyPlayers.clear();
    this.allPlayersReady = false;
  }

  // RoundManager.ts
  public startNextRound() {
    if (this.roundInProgress) {
      logger.info('[ROUND] Round already in progress. Skipping startNextRound.');
      return;
    }
    this.roundInProgress = true;
    logger.info('[ROUND] Starting new round.');

    const playerNicks = Object.keys(this.state.players);
    logger.info(`[ROUND] Players in this round: ${playerNicks.join(', ')}`);

    // Reset deck
    this.state.deck = generateDeck();
    logger.info(`[ROUND] Deck generated. Deck size: ${this.state.deck.length}`);

    // Reset graczy i rozdanie po 2 karty
    playerNicks.forEach((nick) => {
      const p = this.state.players[nick];
      p.hand = [this.state.deck.pop()!, this.state.deck.pop()!];
      p.score = calculateScore(p.hand);
      p.status = 'waiting';
      p.result = null;
      p.bet = 0;
    });

    // Dealer: trzymaj prawdziwe karty w dealerManager, a w state tylko publiczną wersję
    // w tym miejscu przed dealowaniem dodaj:
    const upCard = this.state.deck.pop()!;
    const holeCard = this.state.deck.pop()!;
    

    this.dealerManager.resetHand();
    this.dealerManager.dealCard(upCard); // ✅ odkryta karta
    this.dealerManager.dealCard(holeCard); // ✅ zakryta karta
    

    // W state trzymamy tylko publiczną wersję dealera
    this.state.dealer.hand = this.dealerManager.getHand(true); // pierwsza hidden, druga odkryta
    this.state.dealer.score = this.dealerManager.getScore(true);

    this.resetReady();

    const firstHuman = playerNicks.find((n) => !n.startsWith('Bot'));
    this.state.currentPlayerNick = firstHuman || null;
    this.state.gameStatus = 'player_turn';
    this.state.winner = null;
  }

  public resetGame() {
    const playerNicks = Object.keys(this.state.players);
    const deck = generateDeck();
    const dealer = { hand: [], score: 0 };

    Object.values(this.state.players).forEach((p: PlayerState) => {
      p.hand = [];
      p.score = 0;
      p.status = 'waiting';
      p.bet = 0;
      p.result = null;
    });

    this.state = {
      ...this.state,
      deck,
      dealer,
      currentPlayerNick: playerNicks[0] || null,
      gameStatus: 'player_turn',
      winner: null,
    };
  }

  public isRoundInProgress() {
    return this.roundInProgress;
  }

  private clearReady() {
    this.readyPlayers.clear();
    this.allPlayersReady = false;
  }
}
