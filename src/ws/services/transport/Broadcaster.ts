// src/game/transport/Broadcaster.ts
import type { DealerState, GameState, MyWebSocket } from '@types';
import type { PlayerManager } from '../state/PlayerManager.js';
import type { DealerManager } from '../state/DealerManager.js';
import { Server } from 'ws';
import { dataStore } from '@ws/data/data.js';

export class Broadcaster {
  private state: GameState;
  private playerManager: PlayerManager;
  private dealerManager: DealerManager;

  constructor(state: GameState, playerManager: PlayerManager, dealerManager: DealerManager) {
    this.state = state;
    this.playerManager = playerManager;
    this.dealerManager = dealerManager;
  }

  /** Wysyła stan gry do wszystkich połączeń WS */
  broadcast(wss: Server, specificNick?: string) {
    const publicState = this.getPublicState();
    wss.clients.forEach((client: MyWebSocket) => {
      if (client.readyState !== WebSocket.OPEN || client.lobbyId !== this.state.lobbyId) return;

      if (!specificNick || client.nick === specificNick) {
        client.send(JSON.stringify({ type: 'game_state_public', gameState: publicState }));

        const playerState = this.playerManager.getPlayer(client.nick!);
        if (playerState) {
          client.send(JSON.stringify({ type: 'game_state_private', playerState }));
        }
      }
    });
  }

  /** Wysyła aktualną listę lobby do wszystkich klientów */
  async broadcastLobbyList(wss: Server) {
    await dataStore.withLock(async () => {
      const lobbyList = dataStore.getLobbies().map((l) => ({
        id: l.id,
        players: l.players,
        host: l.host,
        maxPlayers: l.maxPlayers,
        useBots: l.useBots,
      }));

      wss.clients.forEach((client: MyWebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'lobby_list_update', lobbies: lobbyList }));
        }
      });
    });
  }

  /** Przygotowuje publiczny stan gry (np. ukryte karty dealera) */
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

  /** Widok dealera dla publiczności (zakryta karta jeśli nie tura dealera) */
  private getDealerPublicState(dealer: DealerState) {
    const isDealerTurn = this.state.gameStatus === 'dealer_turn' || this.state.gameStatus === 'finished';
    const hand = isDealerTurn ? dealer.hand : dealer.hand.map((_) => ({ suit: 'Hidden', value: 'Hidden' }));
    return { ...dealer, hand };
  }
}
