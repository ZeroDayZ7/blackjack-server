import type { GameState, PlayerState, PlayerStatus, Card } from '@types';
import { generateDeck } from './deck.js';
import logger from '@logger';

export class GameService {
  private state: GameState;

  constructor(lobbyId: string, playerNicks: string[]) {
    const deck = generateDeck();
    const playerHands: Record<string, PlayerState> = {};

    // Przygotowanie graczy z pustymi rękami
    playerNicks.forEach((nick) => {
      playerHands[nick] = {
        nick,
        hand: [],
        score: 0,
        status: 'waiting' as PlayerStatus,
        bet: 0,
        balance: 1000,
      };
    });

    // Dealer
    const dealer = { hand: [], score: 0 };

    this.state = {
      lobbyId,
      players: playerHands,
      dealer,
      currentPlayerNick: playerNicks[0] || null,
      gameStatus: 'player_turn',
      winner: null,
      deck,
    };

    // Rozdanie początkowe po kolei
    this.dealInitialCards();
    this.checkInitialBlackjack();
  }
  // region Public
  /** Pełny stan gry */
  public getState(): GameState {
    return this.state;
  }

  /** Publiczny stan gry dla wszystkich graczy */
  public getPublicState() {
    const { players, dealer, lobbyId, currentPlayerNick, gameStatus, winner } =
      this.state;

    // Ukrywanie kart dealera dopóki nie nadejdzie jego tura lub gra się nie skończy
    const isDealerTurn =
      gameStatus === 'dealer_turn' || gameStatus === 'finished';
    const dealerHandForPublic = isDealerTurn
      ? dealer.hand
      : [
          dealer.hand[0] || null, // Pierwsza karta widoczna
          { suit: 'hidden', value: 'hidden' }, // Druga karta zakryta
        ];
    const dealerScoreForPublic = isDealerTurn
      ? dealer.score
      : this.calculateScore([dealer.hand[0]]); // wynik z widocznej karty

    return {
      lobbyId,
      currentPlayerNick,
      gameStatus,
      winner,
      players: Object.fromEntries(
        Object.entries(players).map(([nick, p]) => [
          nick,
          {
            hand: p.hand, // Pełne ręce graczy
            score: p.score,
            status: p.status,
            bet: p.bet,
            balance: p.balance,
          },
        ]),
      ),
      dealer: {
        hand: dealerHandForPublic,
        score: dealerScoreForPublic,
      },
    };
  }

  /** Dobranie karty graczowi lub dealerowi */
  public drawCard(nick?: string): Card {
    const card = this.state.deck.pop()!;
    if (nick) {
      const player = this.state.players[nick];
      player.hand.push(card);
      player.score = this.calculateScore(player.hand);
      if (player.score > 21) player.status = 'bust';
    } else {
      this.state.dealer.hand.push(card);
      this.state.dealer.score = this.calculateScore(this.state.dealer.hand);
    }
    return card;
  }

  /** Hit: gracz dobiera kartę */
  public hit(nick: string) {
    this.drawCard(nick);
    const player = this.state.players[nick];
    if (player.score > 21) this.nextTurn();
  }

  /** Stand: gracz kończy turę */
  public stand(nick: string) {
    this.state.players[nick].status = 'stand';
    this.nextTurn();
  }

  /** Double: podwaja stawkę, dobiera kartę i kończy turę */
  public double(nick: string) {
    const player = this.state.players[nick];
    if (player.balance >= player.bet) {
      player.balance -= player.bet;
      player.bet *= 2;
      this.drawCard(nick);
      player.status = 'double';
      this.nextTurn();
    }
  }

  /** Przechodzi do kolejnego gracza lub tury dealera */
  public nextTurn() {
    const players = Object.values(this.state.players);
    const currentIndex = players.findIndex(
      (p) => p.nick === this.state.currentPlayerNick,
    );

    for (let i = currentIndex + 1; i < players.length; i++) {
      if (players[i].status === 'waiting') {
        this.state.currentPlayerNick = players[i].nick;
        return;
      }
    }

    // wszyscy gracze skończyli → ruch dealera
    this.state.currentPlayerNick = null;
    this.state.gameStatus = 'dealer_turn';
    this.playDealer();
  }

  /** Pobranie konkretnego gracza */
  public getPlayer(nick: string) {
    return this.state.players[nick] || null;
  }
  // region Private
  /** Dealer dobiera według reguł blackjack */
  private playDealer() {
    const dealer = this.state.dealer;

    while (dealer.score < 17) {
      this.drawCard();
    }

    this.state.gameStatus = 'finished';
    this.determineWinner();
  }

  /** Wyłonienie zwycięzcy */
  private determineWinner() {
    const dealerScore = this.state.dealer.score;
    const results: Record<string, string> = {};

    for (const [nick, player] of Object.entries(this.state.players)) {
      if (player.hand.length === 2 && player.score === 21) {
        results[nick] = 'blackjack'; // blackjack na start
        continue;
      }

      if (player.score > 21) results[nick] = 'lose';
      else if (dealerScore > 21) results[nick] = 'win';
      else if (player.score > dealerScore) results[nick] = 'win';
      else if (player.score < dealerScore) results[nick] = 'lose';
      else results[nick] = 'push';
    }

    const winnerNick = Object.entries(results).find(
      ([_, r]) => r === 'win' || r === 'blackjack',
    );
    this.state.winner = winnerNick ? winnerNick[0] : 'push';

    Object.entries(this.state.players).forEach(([nick, p]) => {
      if (results[nick] === 'blackjack') p.status = 'blackjack';
      else if (results[nick] === 'lose') p.status = 'bust';
      else if (results[nick] === 'win') p.status = 'stand';
      else if (results[nick] === 'push') p.status = 'stand';
    });
  }
  // region checkInitialBlackjack
  // Private: checks for initial blackjack after dealing first two cards
  private checkInitialBlackjack() {
    const dealerBlackjack =
      this.state.dealer.score === 21 && this.state.dealer.hand.length === 2;

    const playerBlackjacks: string[] = [];
    Object.entries(this.state.players).forEach(([nick, player]) => {
      if (player.score === 21 && player.hand.length === 2)
        playerBlackjacks.push(nick);
    });

    if (dealerBlackjack) {
      // Dealer ma blackjacka
      playerBlackjacks.forEach((nick) => {
        // Gracz ma blackjacka → push
        this.state.players[nick].status = 'stand';
      });

      Object.keys(this.state.players).forEach((nick) => {
        if (!playerBlackjacks.includes(nick))
          this.state.players[nick].status = 'bust';
      });

      this.state.currentPlayerNick = null;
      this.state.gameStatus = 'finished';
      this.state.winner = playerBlackjacks.length ? 'push' : 'dealer';
      return true;
    } else if (playerBlackjacks.length) {
      // Gracz ma blackjacka, dealer nie → wygrana gracza
      playerBlackjacks.forEach(
        (nick) => (this.state.players[nick].status = 'blackjack'),
      );
      this.state.currentPlayerNick = null;
      this.state.gameStatus = 'finished';
      this.state.winner =
        playerBlackjacks.length === 1 ? playerBlackjacks[0] : 'push';
      return true;
    }

    return false; // brak blackjacka na start
  }

  /** Rozdanie początkowe: 2 karty dla każdego gracza i dealera */
  private dealInitialCards() {
    const { deck, players, dealer } = this.state;

    for (let i = 0; i < 2; i++) {
      for (const nick of Object.keys(players)) {
        const card = deck.pop()!;
        players[nick].hand.push(card);
        players[nick].score = this.calculateScore(players[nick].hand);
      }
      const dealerCard = deck.pop()!;
      dealer.hand.push(dealerCard);
      dealer.score = this.calculateScore(dealer.hand);
    }
  }

  /** Oblicza wartość ręki gracza */
  private calculateScore(hand: Card[]): number {
    let total = 0;
    let aces = 0;

    for (const card of hand) {
      if (['J', 'Q', 'K'].includes(card.value)) total += 10;
      else if (card.value === 'A') {
        total += 11;
        aces++;
      } else total += parseInt(card.value, 10);
    }

    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    return total;
  }
}
