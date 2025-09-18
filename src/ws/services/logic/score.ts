import type { Card } from '@types';

/** Oblicza wartość ręki gracza/dealera */
export function calculateScore(hand: Card[]): number {
  if (!hand || hand.length === 0) return 0;

  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (!card || !card.value || card.value === 'hidden') continue; // <-- ignorujemy ukryte karty

    if (['J', 'Q', 'K'].includes(card.value)) {
      total += 10;
    } else if (card.value === 'A') {
      total += 11;
      aces++;
    } else {
      const val = parseInt(card.value, 10);
      if (!isNaN(val)) total += val;
    }
  }

  // Jeżeli mamy asa i przekroczyliśmy 21 → licz jako 1 zamiast 11
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}
