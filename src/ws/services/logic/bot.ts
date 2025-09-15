import type { PlayerState } from '@types';
import { calculateScore } from './score.js';

/**
 * Prosta logika bota:
 * - jeśli score < 17 → dobiera kartę
 * - inaczej → pasuje
 */
export function botDecision(player: PlayerState): 'hit' | 'stand' {
  if (player.score < 17) {
    return 'hit';
  }
  return 'stand';
}

/** Aktualizuje status bota na podstawie ręki */
export function updateBotStatus(player: PlayerState) {
  player.score = calculateScore(player.hand);

  if (player.score > 21) {
    player.status = 'bust';
  } else if (player.score === 21) {
    player.status = 'stand';
  } else {
    player.status = 'waiting';
  }
}
