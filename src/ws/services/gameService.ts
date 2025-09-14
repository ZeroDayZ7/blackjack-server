import type {
  GameState,
  PlayerState,
  PlayerStatus,
  Card,
  DealerState,
} from '@types';
import { generateDeck } from './deck.js';
import logger from '@logger';

export class GameService {
  private state: GameState;
  private readyPlayers: Set<string> = new Set();
  private allPlayersReady = false;
  private countdownTimer: NodeJS.Timeout | null = null;
  private roundInProgress = false;
  // #region constructor
  constructor(lobbyId: string, playerNicks: string[]) {
    // Generujemy deck
    const deck = generateDeck();

    const playerHands: Record<string, PlayerState> = {};

    playerNicks.forEach((nick, index) => {
      let hand: Card[] = [];

      if (index === 0) {
        // Pierwszy gracz dostaje wymuszonego blackjacka: As + Król
        hand = [
          { suit: 'Spades', value: 'A' },
          { suit: 'Hearts', value: 'K' },
        ];
      } else {
        // Reszta graczy dobiera 2 losowe karty z decku
        hand = [deck.pop()!, deck.pop()!];
      }

      const score = this.calculateScore(hand);

      playerHands[nick] = {
        nick,
        hand,
        score,
        status: score === 21 ? 'blackjack' : 'waiting',
        result: null,
        bet: 0,
        balance: 1000,
      };
    });

    // Dealer dobiera 2 karty z decku
    const dealerHand = [deck.pop()!, deck.pop()!];
    const dealer = {
      hand: dealerHand,
      score: this.calculateScore(dealerHand),
    };

    this.state = {
      lobbyId,
      players: playerHands,
      dealer,
      currentPlayerNick: playerNicks[0] || null,
      gameStatus: 'player_turn',
      winner: null,
      deck,
    };

    // Jeśli pierwszy gracz ma blackjacka, automatycznie przechodzimy do kolejnego ruchu
    this.checkInitialBlackjack();
  }
  // ==============================================
  // #region ==== Public ====
  // ==============================================
  /** Pełny stan gry */
  public getState(): GameState {
    return this.state;
  }
  // region getPublicState
  /** Publiczny stan gry dla wszystkich graczy */
  public getPublicState() {
    const { players, lobbyId, currentPlayerNick, gameStatus, winner } =
      this.state;

    return {
      lobbyId,
      currentPlayerNick,
      gameStatus,
      winner,
      players: Object.fromEntries(
        Object.entries(players).map(([nick, p]) => [
          nick,
          {
            hand: p.hand,
            score: p.score,
            status: p.status,
            bet: p.bet,
            balance: p.balance,
          },
        ]),
      ),
      dealer: this.getDealerPublicState(),
    };
  }
  // ---------------- Ready + Countdown ----------------
  // #region playerReady
  public playerReady(nick: string) {
    if (nick.startsWith('Bot')) return;

    this.readyPlayers.add(nick);

    const humanPlayers = Object.keys(this.state.players).filter(
      (n) => !n.startsWith('Bot'),
    );

    if (this.readyPlayers.size >= humanPlayers.length) {
      this.allPlayersReady = true;
      this.clearReady();
      this.startNextRound();
    }
  }
  // #region resetReady
  public resetReady() {
    this.readyPlayers.clear();
    this.allPlayersReady = false;
  }
  // #region startCountdown
  public startCountdown(wss: any, lobbyId: string) {
    if (this.roundInProgress) return; // nie startuj, jeśli runda już trwa

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
        this.clearReady();
        this.startNextRound();
      }
    }, 1000);
  }

  // #region startNextRound
  public startNextRound() {
    if (this.roundInProgress) return;
    this.roundInProgress = true;
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
  // #region getCurrentPlayer
  // Getter dla botów
  public getCurrentPlayer(): string | null {
    return this.state.currentPlayerNick;
  }
  // #region resetGame
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
  // #region removePlayer
  /** Usuwa gracza z gry */
  public removePlayer(nick: string) {
    delete this.state.players[nick];
    // jeśli gracz był gotowy, usuń go z readyPlayers
    this.readyPlayers.delete(nick);

    // jeśli currentPlayerNick to właśnie ten gracz, przejdź do następnego
    if (this.state.currentPlayerNick === nick) {
      this.advanceTurn();
    }
  }
  // #region drawCard
  /** Dobranie karty graczowi lub dealerowi */
  public drawCard(nick?: string): Card {
    const card = this.state.deck.pop()!;

    if (nick) {
      const player = this.state.players[nick];
      player.hand.push(card);
      player.score = this.calculateScore(player.hand);
      this.updatePlayerStatus(player);
    } else {
      const dealer = this.state.dealer;
      dealer.hand.push(card);
      dealer.score = this.calculateScore(dealer.hand);
      this.updateDealerStatus(dealer);
    }

    return card;
  }
  // #region hit
  /** Hit: gracz dobiera kartę */
  public hit(nick: string, wss?: any) {
    const player = this.state.players[nick];
    if (!player || player.status !== 'waiting') {
      this.advanceTurn(wss);
      return;
    }

    this.drawCard(nick);
    if (player.score >= 21)
      player.status = player.score > 21 ? 'bust' : 'stand';
    this.advanceTurn(wss);
  }
  // #region stand
  /** Stand: gracz kończy turę */
  public stand(nick: string, wss?: any) {
    const player = this.state.players[nick];
    if (!player || player.status !== 'waiting') {
      this.advanceTurn(wss);
      return;
    }
    player.status = 'stand';
    this.advanceTurn(wss);
  }

  // #region double
  /** Double: podwaja stawkę, dobiera kartę i kończy turę */
  public double(nick: string, wss?: any) {
    const player = this.state.players[nick];
    if (!player || player.status !== 'waiting') return;

    if (player.balance >= player.bet) {
      player.balance -= player.bet;
      player.bet *= 2;
      this.drawCard(nick);
      player.status = 'double';
      this.advanceTurn(wss);
    }
  }
  // #region getPlayer
  /** Pobranie konkretnego gracza */
  public getPlayer(nick: string) {
    return this.state.players[nick] || null;
  }
  // #region proceedNextTurn
  public proceedNextTurn() {
    this.advanceTurn(); // teraz wywołanie jest jawne i w pełni kontrolowane
  }

  // ==============================================
  // #region ==== Private ====
  // ==============================================

  // #region updatePlayerStatus
  private updatePlayerStatus(player: PlayerState) {
    if (player.score === 21 && player.hand.length === 2) {
      player.status = 'blackjack';
    } else if (player.score > 21) {
      player.status = 'bust';
    }
  }
  // #region updateDealerStatus
  // Jeśli dealer potrzebuje statusu
  private updateDealerStatus(dealer: DealerState) {
    // np. można ustawić flagę 'bust', jeśli dealer > 21
    if (dealer.score > 21) {
      dealer.status = 'bust';
    }
  }
  // #region playDealer
  /** Dealer dobiera według reguł blackjack */
  private playDealer(wss?: any) {
    const dealer = this.state.dealer;

    while (dealer.score < 17) {
      this.drawCard();
    }

    this.state.gameStatus = 'finished';
    this.determineWinner();
    if (wss) this.broadcastGameState(wss);
  }
  // #region broadcastGameState
  private broadcastGameState(wss: any) {
    const publicState = this.getPublicState();

    wss.clients.forEach((c: any) => {
      if (c.readyState === 1 && c.lobbyId === this.state.lobbyId) {
        c.send(
          JSON.stringify({ type: 'game_state_public', gameState: publicState }),
        );

        const playerState = this.getPlayer(c.nick);
        if (playerState)
          c.send(JSON.stringify({ type: 'game_state_private', playerState }));
      }
    });
  }

  // #region determineWinner
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

  // #region checkInitialBlackjack
  // Private: checks for initial blackjack after dealing first two cards
  public checkInitialBlackjack(wss?: any) {
    const dealerBlackjack =
      this.state.dealer.score === 21 && this.state.dealer.hand.length === 2;

    const playerBlackjacks: string[] = [];

    Object.entries(this.state.players).forEach(([nick, player]) => {
      if (player.score === 21 && player.hand.length === 2) {
        playerBlackjacks.push(nick);
        player.status = 'blackjack';
        player.result = 'win';
      }
    });

    if (wss) this.broadcastGameState(wss);

    if (dealerBlackjack) {
      this.state.currentPlayerNick = null;
      this.state.gameStatus = 'finished';
      if (playerBlackjacks.length) {
        playerBlackjacks.forEach((nick) => {
          this.state.players[nick].result = 'push';
        });
        this.state.winner = 'push';
      } else {
        this.state.winner = 'dealer';
        Object.values(this.state.players).forEach((p) => (p.status = 'bust'));
      }
      if (wss) this.broadcastGameState(wss);
      return true;
    }

    // Szukamy pierwszego aktywnego gracza
    const nextPlayer = Object.values(this.state.players).find(
      (p) => p.status === 'waiting',
    );
    if (!nextPlayer) {
      this.state.currentPlayerNick = null;
      this.state.gameStatus = 'dealer_turn';
      if (wss) this.broadcastGameState(wss);
    } else {
      this.state.currentPlayerNick = nextPlayer.nick;
      this.state.gameStatus = 'player_turn';
      if (nextPlayer.nick.startsWith('Bot')) {
        this.playBot(nextPlayer.nick, wss); // teraz bot wykonuje ruch + broadcast
      }
    }

    return true;
  }
  // #region dealInitialCards
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

  // #region calculateScore
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

  // #region playBot
  // Logika dla bota
  private playBot(botNick: string, wss?: any) {
    const bot = this.state.players[botNick];
    if (!bot) return;

    // logika decyzji bota
    this.drawCard(botNick);

    // status bota automatycznie aktualizowany w drawCard()
    bot.status =
      bot.score >= 21 ? (bot.score > 21 ? 'bust' : 'stand') : 'waiting';

    if (wss) this.broadcastGameState(wss);
  }

  // #region advanceTurn
  public advanceTurn(wss?: any) {
    const players = Object.values(this.state.players);
    const currentIndex = players.findIndex(
      (p) => p.nick === this.state.currentPlayerNick,
    );

    for (let i = currentIndex + 1; i < players.length; i++) {
      if (players[i].status === 'waiting') {
        this.state.currentPlayerNick = players[i].nick;

        if (players[i].nick.startsWith('Bot')) {
          this.playBot(players[i].nick, wss);
          return;
        }

        if (wss) this.broadcastGameState(wss);
        return;
      }
    }

    this.state.currentPlayerNick = null;
    this.state.gameStatus = 'dealer_turn';
    if (wss) this.broadcastGameState(wss);
    this.playDealer(wss);
  }

  // #region getDealerPublicState
  private getDealerPublicState() {
    const { dealer, gameStatus } = this.state;
    const isDealerTurn =
      gameStatus === 'dealer_turn' || gameStatus === 'finished';

    const hand = isDealerTurn
      ? dealer.hand
      : [dealer.hand[0] || null, { suit: 'hidden', value: 'hidden' }];

    const score = isDealerTurn
      ? dealer.score
      : this.calculateScore([dealer.hand[0]]);

    return { hand, score };
  }

  // #region clearReady
  private clearReady() {
    this.readyPlayers.clear();
    this.allPlayersReady = false;
  }
}
