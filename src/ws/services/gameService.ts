import type { GameState, PlayerState, PlayerStatus, Card } from '@types';
import { generateDeck } from './deck.js';
import logger from '@logger';

export class GameService {
  private state: GameState;
  private readyPlayers: Set<string> = new Set();
  private allPlayersReady = false;
  private countdownTimer: NodeJS.Timeout | null = null;

  constructor(lobbyId: string, playerNicks: string[]) {
    const deck = generateDeck();
    const playerHands: Record<string, PlayerState> = {};

    playerNicks.forEach((nick) => {
      playerHands[nick] = {
        nick,
        hand: [],
        score: 0,
        status: 'waiting' as PlayerStatus,
        result: null,
        bet: 0,
        balance: 1000,
      };
    });

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

    this.dealInitialCards();
    this.checkInitialBlackjack();
  }
  // ---------------- Public ----------------
  // region Public
  /** Pełny stan gry */
  public getState(): GameState {
    return this.state;
  }
  // region getPublicState
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
  // ---------------- Ready + Countdown ----------------
  // region playerReady
  public playerReady(nick: string) {
    // Ignorujemy boty
    if (nick.startsWith('Bot')) return;

    // Dodajemy gracza do gotowych
    this.readyPlayers.add(nick);

    // Pobieramy tylko graczy-człowieka
    const humanPlayers = Object.keys(this.state.players).filter(
      (n) => !n.startsWith('Bot'),
    );

    // Sprawdzamy czy wszyscy ludzie są gotowi
    if (this.readyPlayers.size >= humanPlayers.length) {
      this.allPlayersReady = true;

      // Wyczyść gotowości, żeby nie blokować kolejnej rundy
      this.readyPlayers.clear();

      // Start następnej rundy
      this.startNextRound();
    }
  }

  public resetReady() {
    this.readyPlayers.clear();
    this.allPlayersReady = false;
  }

  public startCountdown(wss: any, lobbyId: string) {
    let countdown = 15;
    this.countdownTimer = setInterval(() => {
      wss.clients.forEach((c: any) => {
        if (c.readyState === 1 && c.lobbyId === lobbyId) {
          c.send(JSON.stringify({ type: 'countdown_update', countdown }));
        }
      });

      countdown--;

      if (countdown < 0 || this.allPlayersReady) {
        clearInterval(this.countdownTimer!);
        this.startNextRound();
        this.resetReady();
      }
    }, 1000);
  }

  // region startNextRound
  public startNextRound() {
    logger.info(`[GAME] Starting next round for lobby ${this.state.lobbyId}`);

    const playerNicks = Object.keys(this.state.players);

    // Reset deck
    this.state.deck = generateDeck();

    // Reset graczy i dealera
    playerNicks.forEach((nick) => {
      const p = this.state.players[nick];
      p.hand = [];
      p.score = 0;
      p.status = 'waiting';
      p.result = null;
      p.bet = 0;
    });

    this.state.dealer.hand = [];
    this.state.dealer.score = 0;

    // Rozdanie kart
    this.dealInitialCards();
    this.checkInitialBlackjack();

    // Reset ready
    this.resetReady();

    // Ustaw pierwszy ruch
    const firstHuman = playerNicks.find((n) => !n.startsWith('Bot'));
    this.state.currentPlayerNick = firstHuman || null;
    this.state.gameStatus = 'player_turn';
    this.state.winner = null;

    logger.info(
      `[GAME] Next round started, current player: ${this.state.currentPlayerNick}`,
    );

    // Bot od razu wykonuje ruch jeśli zaczyna
    const firstPlayer = playerNicks[0];
    if (firstPlayer?.startsWith('Bot')) this.playBot(firstPlayer);
  }

  // Getter dla botów
  public getCurrentPlayer(): string | null {
    return this.state.currentPlayerNick;
  }
  // Reset game
  public resetGame() {
    const playerNicks = Object.keys(this.state.players);
    const deck = generateDeck();
    const dealer = { hand: [], score: 0 };

    Object.values(this.state.players).forEach((p) => {
      p.hand = [];
      p.score = 0;
      p.status = 'waiting';
      p.bet = 0;
    });

    this.state = {
      ...this.state,
      deck,
      dealer,
      currentPlayerNick: playerNicks[0] || null,
      gameStatus: 'player_turn',
      winner: null,
    };

    this.dealInitialCards();
    this.checkInitialBlackjack();
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
  // w GameService
  public nextTurn() {
    const players = Object.values(this.state.players);
    const currentIndex = players.findIndex(
      (p) => p.nick === this.state.currentPlayerNick,
    );

    for (let i = currentIndex + 1; i < players.length; i++) {
      if (players[i].status === 'waiting') {
        this.state.currentPlayerNick = players[i].nick;

        if (players[i].nick.startsWith('Bot')) {
          this.playBot(players[i].nick); // bot wykonuje ruch od razu
          // po ruchu bota przechodzimy do następnego gracza
          this.nextTurn();
        }

        return; // jeśli to człowiek, czekamy na akcję frontend
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
      if (player.score === 21 && player.hand.length === 2) {
        playerBlackjacks.push(nick);
        this.state.players[nick].status = 'blackjack';
      }
    });

    if (dealerBlackjack) {
      // Dealer ma blackjacka -> odkrywa od razu, gra skończona
      this.state.currentPlayerNick = null;
      this.state.gameStatus = 'finished';

      if (playerBlackjacks.length) {
        // gracze z blackjackiem = push, reszta przegrywa
        playerBlackjacks.forEach(
          (nick) => (this.state.players[nick].result = 'push'),
        );

        this.state.winner = 'push';
      } else {
        this.state.winner = 'dealer';
        Object.keys(this.state.players).forEach(
          (nick) => (this.state.players[nick].status = 'bust'),
        );
      }
      return true;
    }

    if (playerBlackjacks.length) {
      // Gracze z blackjackiem stoją od razu,
      // ale reszta gra normalnie
      return false;
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
  /** Oblicza wartość ręki gracza */
  private calculateScore(hand: Card[]): number {
    if (!hand || hand.length === 0) return 0;

    let total = 0;
    let aces = 0;

    for (const card of hand) {
      if (!card || !card.value) continue; // zabezpieczenie przed undefined

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

    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    return total;
  }

  // Logika dla bota
  private playBot(nick: string) {
    const player = this.state.players[nick];
    if (!player || player.status !== 'waiting') return;

    while (player.score < 17) {
      // prosta logika dla bota
      this.drawCard(nick);
    }
    player.status = 'stand';
  }

  private playBots() {
    Object.values(this.state.players)
      .filter((p) => p.nick.startsWith('Bot') && p.status === 'waiting')
      .forEach((bot) => this.playBot(bot.nick));
  }
}
