// src/game/player/PlayerManager.ts
import type { PlayerState, Card } from '@types';
import { calculateScore } from '../logic/score.js';

export class PlayerManager {
  private players: Record<string, PlayerState> = {};

  addPlayer(nick: string, initialBalance = 1000) {
    this.players[nick] = {
      nick,
      hand: [],
      score: 0,
      status: 'waiting',
      bet: 0,
      balance: initialBalance,
      result: null,
    };
  }

  removePlayer(nick: string) {
    delete this.players[nick];
  }

  updateBet(nick: string, amount: number) {
    const player = this.players[nick];
    if (!player) return;
    if (amount > player.balance) throw new Error('Insufficient balance');
    player.bet = amount;
    player.balance -= amount;
  }

  hit(nick: string, card: Card) {
    const player = this.players[nick];
    if (!player) return;
    player.hand.push(card);
    player.score = calculateScore(player.hand);
    player.status = 'player_turn';
  }

  stand(nick: string) {
    const player = this.players[nick];
    if (!player) return;
    player.status = 'stand';
  }

  double(nick: string, card: Card) {
    const player = this.players[nick];
    if (!player) return;
    if (player.bet * 2 > player.balance + player.bet) {
      throw new Error('Insufficient balance to double down');
    }

    // zabieramy dodatkową stawkę
    player.balance -= player.bet;
    player.bet *= 2;

    // gracz dostaje tylko jedną kartę i kończy ruch
    player.hand.push(card);
    player.score = calculateScore(player.hand);
    player.status = 'stand';
  }

  getPlayer(nick: string) {
    return this.players[nick];
  }

  getAllPlayers() {
    return this.players;
  }

  
}
