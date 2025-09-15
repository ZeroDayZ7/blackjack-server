import type { Card } from '@ws/types/index.js';

// export const generateDeck = (): Card[] => {
//   const suits: Card['suit'][] = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
//   const values: Card['value'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
//   const deck: Card[] = [];
//   for (const suit of suits) {
//     for (const value of values) {
//       deck.push({ suit, value });
//     }
//   }
//   return deck.sort(() => Math.random() - 0.5);
// };


 export const generateDeck = (forceBlackjack = false): Card[] => {
  const suits: Card['suit'][] = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  const values: Card['value'][] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }

  deck.sort(() => Math.random() - 0.5);

  if (forceBlackjack) {
    // Pierwsza karta = As
    deck[2] = { suit: 'Spades', value: 'A' };
    // Czwarta karta = Król
    deck[5] = { suit: 'Hearts', value: 'K' };
  }

  return deck;
};

