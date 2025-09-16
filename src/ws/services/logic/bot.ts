// bot.ts
import type { PlayerState, Card } from '@types';
import { calculateScore } from './score.js';

export function botDecision(player: PlayerState, dealerUpCard?: Card): 'hit' | 'stand' | 'double' {
  const score = calculateScore(player.hand);
  const hasSoftHand = player.hand.some((card) => card.value === 'A') && score <= 21;

  // Jeśli dealer ma odkrytą kartę
  const dealerValue = dealerUpCard ? getCardValue(dealerUpCard) : 0;

  // Strategia podstawowa dla bota
  if (score <= 11) {
    return 'hit'; // Zawsze dobierz przy niskim wyniku
  } else if (score >= 17) {
    return 'stand'; // Zawsze pasuj przy wysokim wyniku
  } else if (hasSoftHand && score <= 17) {
    return 'hit'; // Miękka ręka: dobierz przy wyniku <= 17
  } else if (score === 12 && dealerValue >= 4 && dealerValue <= 6) {
    return 'stand'; // Stoj przy 12, jeśli dealer ma słabą kartę (4-6)
  } else if (score >= 13 && score <= 16 && dealerValue >= 7) {
    return 'hit'; // Dobierz przy średnim wyniku, jeśli dealer ma silną kartę
  } else if (score === 11 && player.hand.length === 2 && player.balance >= player.bet * 2) {
    return 'double'; // Podwój przy 11, jeśli możliwe
  }

  return score < 17 ? 'hit' : 'stand';
}

function getCardValue(card: Card): number {
  if (['J', 'Q', 'K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value, 10) || 0;
}

export function updateBotStatus(player: PlayerState) {
  player.score = calculateScore(player.hand);

  if (player.score > 21) {
    player.status = 'bust';
  } else if (player.score === 21 && player.hand.length === 2) {
    player.status = 'blackjack';
  } else if (player.score === 21) {
    player.status = 'stand';
  } else {
    player.status = 'waiting';
  }
}