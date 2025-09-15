// src/game/dealer/DealerManager.ts
import type { AnyCard, Card } from '@types';
import { calculateScore } from '../logic/score.js';

export class DealerManager {
  private hand: Card[] = [];
  private score = 0;

  resetHand() {
    this.hand = [];
    this.score = 0;
  }

  dealCard(card: Card) {
    this.hand.push(card);
    this.score = calculateScore(this.hand);
  }

  playTurn(deck: Card[]) {
    // dobiera do >= 17 (standardowa zasada blackjacka)
    while (this.score < 17 && deck.length > 0) {
      const card = deck.pop();
      if (!card) break;
      this.hand.push(card);
      this.score = calculateScore(this.hand);
    }
  }

  getHand(hidden = true): AnyCard[] {
    if (hidden && this.hand.length > 0) {
      return [this.hand[0], { suit: 'hidden', value: 'hidden' }];
    }
    return this.hand;
  }

  getScore(hidden = true): number {
    return hidden ? 0 : this.score;
  }
}
