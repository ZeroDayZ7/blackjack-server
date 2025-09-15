import type { PlayerState, DealerState } from '@types';

export type GameResult = 'win' | 'lose' | 'push' | 'blackjack';

export function determineWinner(
  players: Record<string, PlayerState>,
  dealer: DealerState,
): { results: Record<string, GameResult>; winner: string | 'push' } {
  const dealerScore = dealer.score;
  const results: Record<string, GameResult> = {};

  for (const [nick, player] of Object.entries(players)) {
    if (player.hand.length === 2 && player.score === 21) {
      results[nick] = 'blackjack';
      continue;
    }

    if (player.score > 21) results[nick] = 'lose';
    else if (dealerScore > 21) results[nick] = 'win';
    else if (player.score > dealerScore) results[nick] = 'win';
    else if (player.score < dealerScore) results[nick] = 'lose';
    else results[nick] = 'push';
  }

  const winnerNick = Object.entries(results).find(
    ([, r]) => r === 'win' || r === 'blackjack',
  );

  return {
    results,
    winner: winnerNick ? winnerNick[0] : 'push',
  };
}
