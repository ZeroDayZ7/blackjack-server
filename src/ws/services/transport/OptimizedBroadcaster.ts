// services/transport/OptimizedBroadcaster.ts
import type { Server, WebSocket } from 'ws';
import type { MyWebSocket, Lobby, GameState } from '@types';
import { dataStore } from '@ws/data/transactionalDataStore.js';
import { ConnectionManager } from '../../connectionManager.js';
import { metrics } from '../../metrics.js';
import { LRUCache } from 'lru-cache';
import logger from '@logger';

interface BroadcastContext {
  lobbyId?: string;
  excludeNicks?: string[];
  includeOnlyNicks?: string[];
  priority?: 'high' | 'normal' | 'low';
  force?: boolean;
}

export class OptimizedBroadcaster {
  private static readonly instance = new OptimizedBroadcaster();
  private static connectionManager: ConnectionManager;

  // Caches
  private static readonly lobbyCache = new LRUCache<string, Lobby[]>({
    max: 100,
    ttl: 1000 * 30, // 30s
    updateAgeOnGet: true,
  });

  private static readonly gameStateCache = new LRUCache<string, GameState>({
    max: 50,
    ttl: 1000 * 5, // 5s dla game state
  });

  // Broadcast queue z prioritization
  private static readonly broadcastQueue = new Map<
    string,
    Array<{
      data: any;
      timestamp: number;
      options: BroadcastContext;
      resolve?: (value: any) => void;
      reject?: (error: Error) => void;
    }>
  >();

  private static readonly broadcastLimiter = new Map<string, number>();

  private constructor() {
    // Initialize queue processor
    setInterval(() => this.processBroadcastQueue(), 10);
  }

  static initialize(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Batch broadcast listy lobby z debouncing
   */
  static async broadcastLobbyList(wss: Server, forceRefresh = false, context: BroadcastContext = {}): Promise<void> {
    const startTime = process.hrtime.bigint();
    const cacheKey = 'global_lobby_list';

    let lobbies: Lobby[];
    if (forceRefresh || !this.lobbyCache.has(cacheKey)) {
      await metrics.observe(
        'broadcast_duration_milliseconds',
        async () => {
          lobbies = dataStore.getLobbiesSnapshot();
          this.lobbyCache.set(cacheKey, lobbies);
        },
        { type: 'lobby_list', lobby_id: 'global' },
      );
    } else {
      lobbies = this.lobbyCache.get(cacheKey)!;
    }

    const message = {
      type: 'lobby_list_update',
      timestamp: Date.now(),
      lobbies: lobbies.map((l) => ({
        ...l,
        players: [...l.players], // Immutable copy
      })),
      cacheHit: this.lobbyCache.has(cacheKey) && !forceRefresh,
    };

    const clientsToUpdate = this.getEligibleClients(wss, context);

    // Batch processing dla wydajności
    const BATCH_SIZE = 50;
    const batches = Math.ceil(clientsToUpdate.length / BATCH_SIZE);

    for (let i = 0; i < batches; i++) {
      const batch = clientsToUpdate.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      await Promise.allSettled(batch.map((client) => this.sendMessage(client, message, { type: 'lobby_list' })));
    }

    const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    metrics.observe('broadcast_duration_milliseconds', duration, {
      type: 'lobby_list',
      lobby_id: 'global',
      recipients: clientsToUpdate.length,
    });

    logger.debug(`[BROADCAST] Lobby list sent to ${clientsToUpdate.length} clients`, {
      duration,
      cacheHit: message.cacheHit,
      batchCount: batches,
    });

    metrics.recordMessage('lobby_list_update', undefined, undefined, 'success');
  }

  /**
   * Game state broadcast z differential updates
   */
  static async broadcastGameState(wss: Server, gameState: GameState, lobbyId: string, context: BroadcastContext = {}): Promise<void> {
    const startTime = process.hrtime.bigint();
    const cacheKey = `game_state_${lobbyId}`;
    const lastState = this.gameStateCache.get(cacheKey);

    // Differential update - sprawdź czy stan się zmienił
    if (!context.force && lastState && this.statesAreSimilar(lastState, gameState)) {
      logger.debug(`[BROADCAST] Skipping similar game state for ${lobbyId}`);
      return;
    }

    // Cache new state
    this.gameStateCache.set(cacheKey, gameState);

    const publicState = this.preparePublicState(gameState);
    const clients = this.getLobbyClients(wss, lobbyId, context);

    // Prepare messages
    const publicMessage = {
      type: 'game_state_public',
      gameState: publicState,
      delta: !lastState, // Mark as full state if no previous
    };

    // Send to all clients concurrently
    const sendPromises = clients.map(async (client) => {
      const privateState = gameState.players[client.nick || ''];

      // Send public state
      await this.sendMessage(client, publicMessage, { type: 'game_state_public' });

      // Send private state if applicable
      if (privateState) {
        await this.sendMessage(
          client,
          {
            type: 'game_state_private',
            playerState: privateState,
          },
          { type: 'game_state_private' },
        );
      }
    });

    await Promise.allSettled(sendPromises);

    const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    metrics.observe('broadcast_duration_milliseconds', duration, {
      type: 'game_state',
      lobby_id: lobbyId,
      recipients: clients.length,
      cacheHit: !!lastState && this.statesAreSimilar(lastState, gameState),
    });

    logger.debug(`[BROADCAST] Game state sent to ${clients.length} clients in ${lobbyId}`, {
      duration,
      stateSize: JSON.stringify(publicState).length,
    });

    metrics.recordMessage('game_state_update', lobbyId);
  }

  /**
   * Broadcast do konkretnego lobby
   */
  static async broadcastToLobby(wss: Server, lobbyId: string, data: any, context: BroadcastContext = {}): Promise<void> {
    const startTime = process.hrtime.bigint();
    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);

    if (!lobby) {
      logger.warn(`[BROADCAST] Lobby not found: ${lobbyId}`);
      return;
    }

    const message = {
      type: 'lobby_update',
      lobby: {
        ...lobby,
        players: [...lobby.players],
      },
      ...data,
    };

    const clients = this.getLobbyClients(wss, lobbyId, context);
    const sendPromises = clients.map((client) => this.sendMessage(client, message, { type: 'lobby_update' }));

    await Promise.allSettled(sendPromises);

    const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    metrics.observe('broadcast_duration_milliseconds', duration, {
      type: 'lobby_update',
      lobby_id: lobbyId,
      recipients: clients.length,
    });

    logger.debug(`[BROADCAST] Lobby update sent to ${clients.length} clients`, {
      lobbyId,
      duration,
    });
  }

  /**
   * Obsługa disconnect - czyszczenie i notify
   */
  static async handleDisconnect(ws: MyWebSocket, wss: Server): Promise<void> {
    if (!ws.lobbyId || !ws.nick) {
      logger.debug('[DISCONNECT] No lobby/nick, skipping cleanup', {
        connectionId: ws.connectionId,
      });
      return;
    }

    const { lobbyId, nick } = ws;
    logger.info(`[DISCONNECT] Handling disconnect`, { lobbyId, nick });

    // Notify game/lobby systems
    await dataStore.transactional(
      async (store) => {
        const lobbyMeta = store.getLobby(lobbyId);
        if (!lobbyMeta) {
          logger.debug(`[DISCONNECT] Lobby not found: ${lobbyId}`);
          return;
        }

        const lobby = { ...lobbyMeta.lobby };
        const wasHost = lobby.host === nick;

        // Immutable player list update
        const newPlayers = lobby.players.filter((p) => p !== nick);
        const newHost = wasHost && newPlayers.length > 0 ? newPlayers.find((p) => !p.startsWith('Bot')) || newPlayers[0] : lobby.host;

        const updatedLobby = {
          ...lobby,
          players: newPlayers,
          host: newHost,
        };

        // Update lobby
        store.updateLobby(lobbyId, () => ({
          lobby: updatedLobby,
          lastActive: Date.now(),
          version: lobbyMeta.version + 1,
        }));

        // Check if lobby should be removed
        const humanPlayers = newPlayers.filter((p) => !p.startsWith('Bot'));
        if (humanPlayers.length === 0) {
          store.deleteLobby(lobbyId);
          logger.info(`[DISCONNECT] Empty lobby removed: ${lobbyId}`);
        } else {
          // Broadcast lobby update
          this.broadcastToLobby(wss, lobbyId, {
            event: 'player_disconnected',
            player: nick,
            wasHost,
            newHost,
          });
        }

        // Remove from game if active
        const gameMeta = store.getGame(lobbyId);
        if (gameMeta) {
          const game = gameMeta.game;
          game.removePlayer(nick);
          store.touchGame(lobbyId); // Update last active
          logger.info(`[DISCONNECT] Player removed from game: ${nick} in ${lobbyId}`);
        }

        metrics.recordMessage('player_disconnect', lobbyId, nick, 'handled');
      },
      { type: 'lobby' },
    );

    // Grace period - attempt reconnect
    setTimeout(async () => {
      const reconnected = await this.checkReconnect(lobbyId, nick);
      if (!reconnected) {
        logger.info(`[DISCONNECT] Permanent removal of ${nick} from ${lobbyId}`);
        // Trigger final cleanup if needed
        this.broadcastToLobby(wss, lobbyId, {
          event: 'player_permanently_left',
          player: nick,
        });
      }
    }, 15000); // 15 second grace period
  }

  /**
   * Sprawdza czy gracz się zrekonektował
   */
  private static async checkReconnect(lobbyId: string, nick: string): Promise<boolean> {
    // Check if player rejoined
    const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
    if (lobby && lobby.players.includes(nick)) {
      logger.info(`[RECONNECT] Player ${nick} rejoined ${lobbyId}`);
      metrics.increment('ws_reconnections_total', 1, { lobby_id: lobbyId, player: nick });
      return true;
    }
    return false;
  }

  /**
   * Wysyła wiadomość z backpressure handling
   */
  private static async sendMessage(client: MyWebSocket, message: any, metricsLabels: { type: string }): Promise<void> {
    if (client.readyState !== WebSocket.OPEN) {
      throw new Error('Client not connected');
    }

    try {
      // Async JSON stringify dla wydajności
      const jsonString = JSON.stringify(message);

      // Check buffer size
      if (jsonString.length > 100 * 1024) {
        // 100KB limit
        logger.warn('[SEND] Message too large, skipping', {
          size: jsonString.length,
          nick: client.nick,
          type: message.type,
        });
        return;
      }

      client.send(jsonString, (error?: Error) => {
        if (error) {
          logger.warn('[SEND_ERROR] Failed to send message', {
            error: error.message,
            nick: client.nick,
            type: message.type,
            size: jsonString.length,
          });
          metrics.increment('ws_send_errors_total', 1, {
            type: metricsLabels.type,
            error: error.message,
          });
          client.recordError();
        } else {
          client.updateActivity();
          metrics.recordMessage(message.type, client.lobbyId);
        }
      });
    } catch (error) {
      logger.error('[SEND_PREPARE_ERROR]', {
        error: (error as Error).message,
        nick: client.nick,
        type: message.type,
      });
      throw error;
    }
  }

  /**
   * Pobiera klientów kwalifikujących się do broadcast
   */
  private static getEligibleClients(wss: Server, context: BroadcastContext): MyWebSocket[] {
    return Array.from(wss.clients)
      .filter((client: MyWebSocket) => {
        if (client.readyState !== WebSocket.OPEN) return false;

        // Global broadcast - wszyscy klienci nie w grze
        if (!context.lobbyId) {
          if (client.inGame) return false;
          if (context.excludeNicks?.includes(client.nick || '')) return false;
          return true;
        }

        // Lobby-specific
        if (client.lobbyId !== context.lobbyId) return false;
        if (context.excludeNicks?.includes(client.nick || '')) return false;
        if (context.includeOnlyNicks && !context.includeOnlyNicks.includes(client.nick || '')) {
          return false;
        }

        return true;
      })
      .map((client: MyWebSocket) => client)
      .filter((client) => client.isActive); // Tylko aktywne połączenia
  }

  /**
   * Pobiera klientów dla konkretnego lobby
   */
  private static getLobbyClients(wss: Server, lobbyId: string, context: BroadcastContext): MyWebSocket[] {
    return this.getEligibleClients(wss, { ...context, lobbyId });
  }

  /**
   * Porównuje stany dla differential updates
   */
  private static statesAreSimilar(state1: GameState, state2: GameState): boolean {
    // Kluczowe pola do porównania
    const criticalFields = [
      'gameStatus',
      'currentPlayerNick',
      'winner',
      'roundNumber', // Dodaj jeśli istnieje
    ];

    // Sprawdź critical fields
    for (const field of criticalFields) {
      if ((state1 as any)[field] !== (state2 as any)[field]) {
        return false;
      }
    }

    // Sprawdź czy zmieniły się ręce graczy (uproszczone)
    const playerHandsChanged = Object.entries(state1.players).some(([nick, p1]) => {
      const p2 = state2.players[nick];
      if (!p2) return true;

      // Sprawdź czy długość ręki się zmieniła
      return p1.hand.length !== p2.hand.length;
    });

    return !playerHandsChanged;
  }

  /**
   * Przygotowuje publiczny stan (ukrywa sensitive data)
   */
  private static preparePublicState(state: GameState): any {
    const { players, dealer, ...publicFields } = state;

    return {
      ...publicFields,
      players: Object.fromEntries(
        Object.entries(players).map(([nick, player]) => [
          nick,
          {
            hand: player.hand.map((card) => ({
              suit: card.suit,
              value: card.value === 'hidden' ? 'hidden' : card.value,
            })),
            score: player.score,
            status: player.status,
            bet: player.bet,
            balance: player.balance, // Publiczne salda
            result: player.result,
          },
        ]),
      ),
      dealer: {
        hand: dealer.hand.map((card) => ({
          suit: card.suit,
          value: card.value === 'hidden' ? 'hidden' : card.value,
        })),
        score: dealer.score,
      },
    };
  }

  /**
   * Procesuje kolejkę broadcast z priorytetami
   */
  private processBroadcastQueue(): void {
    for (const [lobbyId, queue] of this.broadcastQueue) {
      if (queue.length === 0) continue;

      // Sort by priority (high first)
      queue.sort((a, b) => {
        const prioA = a.options.priority === 'high' ? 0 : 1;
        const prioB = b.options.priority === 'high' ? 0 : 1;
        return prioA - prioB;
      });

      // Process highest priority first
      const next = queue.shift()!;
      this.processBroadcastItem(lobbyId, next).catch((err) => {
        logger.error('[QUEUE_ERROR]', { lobbyId, error: err.message });
        if (next.reject) next.reject(err);
      });
    }
  }

  private async processBroadcastItem(lobbyId: string, item: { data: any; options: BroadcastContext; resolve?: Function; reject?: Function }) {
    try {
      const wss = this.connectionManager.getActiveConnections()[0]?.upgraded || globalThis.wss;

      switch (item.data.type) {
        case 'lobby_update':
        case 'lobby_list_update':
          await this.broadcastToLobby(wss, lobbyId, item.data, item.options);
          break;
        case 'game_state_public':
        case 'game_state_private':
          await this.broadcastGameState(wss, item.data.gameState, lobbyId, item.options);
          break;
        default:
          await this.broadcastToLobby(wss, lobbyId, item.data, item.options);
      }

      if (item.resolve) item.resolve({ success: true });
    } catch (error) {
      logger.error('[BROADCAST_QUEUE_ERROR]', {
        lobbyId,
        error: (error as Error).message,
      });

      if (item.reject) item.reject(error);
    }
  }

  // Static queue methods
  static queueBroadcast(lobbyId: string, data: any, options: BroadcastContext = {}): Promise<{ success: boolean }> {
    return new Promise((resolve, reject) => {
      const queue = this.broadcastQueue.get(lobbyId) || [];
      queue.push({ data, options, timestamp: Date.now(), resolve, reject });

      if (!this.broadcastQueue.has(lobbyId)) {
        this.broadcastQueue.set(lobbyId, queue);
      }
    });
  }
}

// Global exports dla kompatybilności
export const broadcastLobbyList = OptimizedBroadcaster.broadcastLobbyList.bind(OptimizedBroadcaster);
export const broadcastToLobby = OptimizedBroadcaster.broadcastToLobby.bind(OptimizedBroadcaster);
export const broadcastGameState = OptimizedBroadcaster.broadcastGameState.bind(OptimizedBroadcaster);
export const handleDisconnect = OptimizedBroadcaster.handleDisconnect.bind(OptimizedBroadcaster);
export const sendLobbyListTo = (ws: MyWebSocket) => {
  const lobbies = dataStore.getLobbiesSnapshot();
  ws.send(
    JSON.stringify({
      type: 'lobbies_updated',
      lobbies,
      timestamp: Date.now(),
    }),
  );
};
