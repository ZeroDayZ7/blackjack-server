import logger from '@logger';
import { DealerManager, GameStateManager, PlayerManager, RoundManager } from './state/index.js';
import { BroadcasterGame } from './transport/BroadcasterGame.js';
import type { PlayerState } from '@types';

export class GameService {
  private state: GameStateManager;
  private roundManager: RoundManager;
  private playerManager: PlayerManager;
  private dealerManager: DealerManager;
  private broadcaster: BroadcasterGame;

  constructor(lobbyId: string, playerNicks: string[]) {
    logger.info(`[GameService] Initializing game for lobby ${lobbyId} with players: ${playerNicks.join(', ')}`);
    this.state = new GameStateManager(lobbyId, playerNicks);
    logger.info(
      `[GameService] GameStateManager initialized. Players: ${Object.keys(this.state.getState().players).join(', ')}`,
    );

    this.roundManager = this.state.roundManager;
    logger.info(`[GameService] RoundManager initialized`);

    this.playerManager = this.state.playerManager;
    logger.info(`[GameService] PlayerManager initialized`);

    this.dealerManager = this.state.dealerManager;
    logger.info(`[GameService] DealerManager initialized`);

    this.broadcaster = new BroadcasterGame(this.state.getState(), this.playerManager, this.dealerManager);
    logger.info(`[GameService] Broadcaster initialized`);
  }

  // Pobranie pełnego stanu gry
  public getState() {
    const state = this.state.getState();
    logger.info(`[GameService] getState called. Current state: ${JSON.stringify(state)}`);
    return state;
  }

  // Reset gry (nowa runda lub restart lobby)
  public resetGame(wss: any) {
    logger.info(`[GameService] resetGame called`);
    this.state.resetGame();
    this.broadcaster.broadcast(wss); // broadcast po resecie
    logger.info(`[GameService] Game reset and broadcasted`);
  }

  // Publiczny stan gry do WS
  public getPublicState() {
    const publicState = this.state.getPublicState();
    logger.info(`[GameService] getPublicState called: ${JSON.stringify(publicState, null, 2)}`);
    return publicState;
  }

  // Pobranie prywatnego stanu gracza
  public getPlayer(nick: string): PlayerState | undefined {
    const player = this.playerManager.getPlayer(nick);
    logger.info(`[GameService] getPlayer called for ${nick}: ${JSON.stringify(player)}`);
    return player;
  }

  public areAllPlayersReady(): boolean {
    const humanPlayers = Object.keys(this.state.getState().players).filter((n) => !n.startsWith('Bot'));
    const ready = humanPlayers.every((nick) => this.roundManager.isPlayerReady(nick));
    logger.info(`[GameService] areAllPlayersReady called. Result: ${ready}`);
    return ready;
  }

  // Oznaczenie gracza jako gotowego
  public playerReady(nick: string) {
    logger.info(`[GameService] playerReady called for ${nick}`);
    this.roundManager.playerReady(nick);
  }

  // Usuwanie gracza
  public removePlayer(nick: string, wss?: any) {
    logger.info(`[GameService] removePlayer called for ${nick}`);
    this.playerManager.removePlayer(nick);
    this.roundManager.resetReady();
    if (wss) {
      this.broadcaster.broadcast(wss);
      logger.info(`[GameService] removePlayer broadcasted state after removal`);
    }
  }

  // Start kolejnej rundy po gotowości graczy
  // GameService
  public startNextRound(wss: any) {
    logger.info(`[GameService] startNextRound called`);
    this.roundManager.startNextRound(); // <-- RoundManager zajmuje się rozdaniem kart
    logger.info(`[GameService] RoundManager.startNextRound executed`);

    // Teraz tylko broadcast
    this.broadcaster.broadcast(wss);
    logger.info(`[GameService] Broadcasted new round state`);
  }

  // Akcje gracza
  public hit(nick: string, wss: any) {
    const card = this.state.getState().deck.pop()!;
    logger.info(`[GameService] hit called by ${nick}. Card drawn: ${JSON.stringify(card)}`);
    this.playerManager.hit(nick, card);
    this.roundManager.advanceTurn(wss);
    this.broadcaster.broadcast(wss);
    logger.info(`[GameService] hit processed and broadcasted`);
  }

  public stand(nick: string, wss: any) {
    logger.info(`[GameService] stand called by ${nick}`);
    this.playerManager.stand(nick);
    this.roundManager.advanceTurn(wss);
    this.broadcaster.broadcast(wss);
    logger.info(`[GameService] stand processed and broadcasted`);
  }

  public double(nick: string, wss: any) {
    const card = this.state.getState().deck.pop()!;
    logger.info(`[GameService] double called by ${nick}. Card drawn: ${JSON.stringify(card)}`);
    this.playerManager.double(nick, card);
    this.roundManager.advanceTurn(wss);
    this.broadcaster.broadcast(wss);
    logger.info(`[GameService] double processed and broadcasted`);
  }

  // Koniec rundy
  public endRound(wss: any) {
    logger.info(`[GameService] endRound called`);
    this.roundManager.endRound(this.playerManager.getAllPlayers());
    this.broadcaster.broadcast(wss);
    logger.info(`[GameService] endRound broadcasted`);
  }
}
