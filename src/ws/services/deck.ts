import type { Card } from "@types";

export const generateDeck = (): Card[] => {
  const suits: Card["suit"][] = ["Hearts", "Diamonds", "Clubs", "Spades"];
  const values: Card["value"][] = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  return deck.sort(() => Math.random() - 0.5); // tasowanie
};
