// services/gameServiceEnhanced.ts
import { EventEmitter } from 'events';
import type { Server } from 'ws';
import type { GameState, PlayerState } from '@types';
import { GameStateManager } from './state/GameStateManager.js';
import { OptimizedBroadcaster } from '../services/transport/OptimizedBroadcaster.js';
import logger from '@logger';
import { ErrorHandler } from '../../middleware/errorHandler.js';

export enum GamePhase {
  WAITING_FOR_PLAYERS = 'waiting_for_players',
  WAITING_FOR_READY = 'waiting_for_ready',
  PLAYER_TURN = 'player_turn',
  DEALER_TURN = 'dealer_turn',
  ROUND_FINISHED = 'round_finished',
  GAME_OVER = 'game_over',
}

export interface GameEvent {
  type: string;
  data?: any;
  timestamp: number;
}

export class EnhancedGameService extends EventEmitter {
  private stateManager: GameStateManager;
  private currentPhase: GamePhase = GamePhase.WAITING_FOR_PLAYERS;
  private readonly lobbyId: string;
  private readonly maxPlayers: number;

  // Metrics
  private roundCount = 0;
  private actionCount = 0;
  private readonly startTime = Date.now();

  constructor(lobbyId: string, playerNicks: string[], maxPlayers = 6) {
    super();
    this.lobbyId = lobbyId;
    this.maxPlayers = maxPlayers;

    this.stateManager = new GameStateManager(lobbyId, playerNicks);
    this.initializeEventHandlers();

    logger.info(`[GAME_SERVICE] Initialized for lobby ${lobbyId} with ${playerNicks.length} players`);
  }

  private initializeEventHandlers() {
    // Listen for internal state changes
    this.stateManager.on('state_changed', (newState: GameState) => {
      this.emit('state_changed', newState);
      this.updateMetrics(newState);
    });
  }

  private updateMetrics(state: GameState) {
    if (state.gameStatus === GamePhase.ROUND_FINISHED) {
      this.roundCount++;
    }
  }

  getStats() {
    return {
      lobbyId: this.lobbyId,
      phase: this.currentPhase,
      roundsPlayed: this.roundCount,
      actionsProcessed: this.actionCount,
      uptime: Date.now() - this.startTime,
      playerCount: Object.keys(stateManager.getState().players).length,
      memory: this.estimateMemoryUsage(),
    };
  }

  private estimateMemoryUsage(): number {
    try {
      return JSON.stringify(this.stateManager.getState()).length;
    } catch {
      return 0;
    }
  }

  // State Machine methods
  async transitionTo(phase: GamePhase, data?: any): Promise<void> {
    if (this.currentPhase === phase) {
      logger.debug(`[GAME] Already in phase ${phase}`);
      return;
    }

    logger.info(`[GAME] Transition ${this.currentPhase} -> ${phase}`, { lobbyId: this.lobbyId });

    switch (phase) {
      case GamePhase.PLAYER_TURN:
        await this.startPlayerTurn(data);
        break;
      case GamePhase.DEALER_TURN:
        await this.startDealerTurn();
        break;
      case GamePhase.WAITING_FOR_READY:
        await this.waitForReady();
        break;
      default:
        throw new Error(`Invalid phase transition to ${phase}`);
    }

    this.currentPhase = phase;
    this.emit('phase_changed', { from: this.currentPhase, to: phase, data });
  }

  private async startPlayerTurn(data?: { startingPlayer?: string }) {
    const state = this.stateManager.getState();
    if (!data?.startingPlayer && !state.currentPlayerNick) {
      throw new Error('Cannot start player turn without current player');
    }

    this.stateManager.setCurrentPlayer(data?.startingPlayer || state.currentPlayerNick!);
    await this.broadcastState();
  }

  private async startDealerTurn() {
    await ErrorHandler.monitorPerformance('dealer_turn', async () => {
      const state = this.stateManager.getState();
      this.stateManager.startDealerTurn();
      await this.broadcastState();
    });
  }

  private async waitForReady() {
    this.stateManager.resetReadyStates();
    await this.broadcastState({ message: 'Waiting for all players to be ready' });
  }

  // Action handlers z walidacją fazy
  async handlePlayerAction(action: PlayerAction, nick: string): Promise<void> {
    if (this.currentPhase !== GamePhase.PLAYER_TURN) {
      throw new Error(`Invalid action ${action} in phase ${this.currentPhase}`);
    }

    const currentPlayer = this.stateManager.getCurrentPlayer();
    if (currentPlayer !== nick) {
      throw new Error(`Not your turn. Current player: ${currentPlayer}`);
    }

    await ErrorHandler.monitorPerformance(`player_action_${action}`, async () => {
      switch (action) {
        case 'hit':
          await this.handleHit(nick);
          break;
        case 'stand':
          await this.handleStand(nick);
          break;
        case 'double':
          await this.handleDouble(nick);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      this.actionCount++;
      await this.checkTurnComplete();
    });
  }

  private async handleHit(nick: string) {
    const card = this.stateManager.drawCard();
    if (!card) {
      throw new Error('No cards left in deck');
    }

    this.stateManager.addCardToPlayer(nick, card);
    await this.broadcastState({ highlightPlayer: nick });

    // Auto-stand na bust
    if (this.stateManager.getPlayerScore(nick) > 21) {
      await this.handleStand(nick);
    }
  }

  private async handleStand(nick: string) {
    this.stateManager.setPlayerStatus(nick, 'stand');
    await this.broadcastState();
  }

  private async handleDouble(nick: string) {
    const player = this.stateManager.getPlayer(nick);
    if (!player || player.bet * 2 > player.balance) {
      throw new Error('Insufficient balance to double down');
    }

    // Double down logic
    player.balance -= player.bet;
    player.bet *= 2;

    const card = this.stateManager.drawCard();
    if (card) {
      this.stateManager.addCardToPlayer(nick, card);
    }

    this.stateManager.setPlayerStatus(nick, 'stand');
    await this.broadcastState({ highlightPlayer: nick });
  }

  private async checkTurnComplete() {
    const unfinishedPlayers = this.stateManager.getUnfinishedPlayers();

    if (unfinishedPlayers.length === 0) {
      // All players finished, dealer turn
      await this.transitionTo(GamePhase.DEALER_TURN);
    } else if (unfinishedPlayers.length === 1) {
      // Advance to next player
      const nextPlayer = unfinishedPlayers[0];
      this.stateManager.setCurrentPlayer(nextPlayer);
      await this.broadcastState();
    }
  }

  // Broadcast z optimization
  private async broadcastState(extraData: Record<string, any> = {}) {
    const state = this.stateManager.getPublicState();
    await OptimizedBroadcaster.broadcastGameState(this.wss, state, this.lobbyId, {
      includeOnlyNicks: Object.keys(state.players).filter((nick) => !nick.startsWith('Bot')),
    });

    this.emit('state_broadcasted', {
      lobbyId: this.lobbyId,
      stateHash: this.hashState(state),
      extraData,
    });
  }

  private hashState(state: GameState): string {
    // Simple hash dla cache invalidation
    return Buffer.from(JSON.stringify(state)).toString('base64').slice(0, 16);
  }

  // Public API
  async startNextRound(): Promise<void> {
    if (this.currentPhase !== GamePhase.WAITING_FOR_READY) {
      throw new Error('Can only start round when waiting for ready');
    }

    await ErrorHandler.monitorPerformance('start_round', async () => {
      this.stateManager.initializeNewRound();
      await this.transitionTo(GamePhase.PLAYER_TURN);
    });
  }

  async playerReady(nick: string): Promise<boolean> {
    if (this.currentPhase !== GamePhase.WAITING_FOR_READY) {
      return false;
    }

    const allReady = this.stateManager.markPlayerReady(nick);

    if (allReady) {
      await this.startNextRound();
    }

    return allReady;
  }

  async removePlayer(nick: string): Promise<void> {
    this.stateManager.removePlayer(nick);

    // Check if game should end
    const remainingPlayers = Object.keys(this.stateManager.getState().players).filter((n) => !n.startsWith('Bot'));

    if (remainingPlayers.length === 0) {
      this.emit('game_ended', { reason: 'no_players_left', lobbyId: this.lobbyId });
    }

    await this.broadcastState();
  }

  async resetGame(): Promise<void> {
    this.stateManager.resetGame();
    this.currentPhase = GamePhase.WAITING_FOR_PLAYERS;
    this.actionCount = 0;
    await this.broadcastState({ reset: true });
  }

  // Getters
  getState() {
    return this.stateManager.getState();
  }
  getPublicState() {
    return this.stateManager.getPublicState();
  }
  getPlayer(nick: string): PlayerState | undefined {
    return this.stateManager.getPlayer(nick);
  }
  getCurrentPlayer(): string | null {
    return this.stateManager.getCurrentPlayer();
  }
  areAllPlayersReady(): boolean {
    return this.stateManager.areAllPlayersReady();
  }
  isRoundInProgress(): boolean {
    return this.currentPhase === GamePhase.PLAYER_TURN || this.currentPhase === GamePhase.DEALER_TURN;
  }

  // Cleanup
  destroy() {
    this.removeAllListeners();
    this.stateManager.destroy();
  }
}
