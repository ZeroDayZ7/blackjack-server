import type { DealerState, GameState, MyWebSocket } from '@types';
import type { PlayerManager } from '../state/PlayerManager.js';
import type { DealerManager } from '../state/DealerManager.js';
import { Server } from 'ws';

/**
 * BroadcasterGame
 * ----------------
 * Odpowiada wyłącznie za wysyłanie stanu gry w konkretnym lobby
 * - publiczny stan gry (ukryte karty dealera)
 * - prywatny stan gracza
 */
export class BroadcasterGame {
  private state: GameState;
  private playerManager: PlayerManager;
  private dealerManager: DealerManager;

  constructor(state: GameState, playerManager: PlayerManager, dealerManager: DealerManager) {
    this.state = state;
    this.playerManager = playerManager;
    this.dealerManager = dealerManager;
  }

  /**
   * Wysyła stan gry do wszystkich połączeń w lobby
   * @param wss WebSocket Server
   * @param specificNick wysyłka tylko do konkretnego gracza (opcjonalnie)
   */
  public broadcast(wss: Server, specificNick?: string) {
    const publicState = this.getPublicState();
    const activeClients = Array.from(wss.clients).filter(
      (client: MyWebSocket) => client.readyState === WebSocket.OPEN && client.lobbyId === this.state.lobbyId,
    );

    activeClients.forEach((client: MyWebSocket) => {
      if (!specificNick || client.nick === specificNick) {
        client.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));
        const playerState = this.playerManager.getPlayer(client.nick!);
        if (playerState) {
          client.send(JSON.stringify({ type: 'game_state_private', playerState }));
        }
      }
    });
  }
  /** Przygotowuje publiczny stan gry (ukrywa karty dealera jeśli nie tura dealera) */
  private getPublicState() {
    const { players, lobbyId, currentPlayerNick, gameStatus, winner, dealer } = this.state;

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
      dealer: this.getDealerPublicState(dealer),
    };
  }

  /** Widok dealera dla publiczności (ukryte karty jeśli nie jego tura) */
  private getDealerPublicState(dealer: DealerState) {
    const isDealerTurn = this.state.gameStatus === 'dealer_turn' || this.state.gameStatus === 'finished';
    const isHidden = !isDealerTurn; // Ukryj jeśli nie tura dealera

    // Użyj DealerManager zamiast mapowania – załóż, że state.dealer jest spójny
    return {
      hand: this.dealerManager.getHand(isHidden),
      score: this.dealerManager.getScore(isHidden),
    };
  }
}
