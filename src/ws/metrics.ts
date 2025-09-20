// ws/metrics.ts
// import { Histogram, Counter, Gauge, collectDefaultMetrics, register } from 'prom-client';
import logger from '@logger';

export interface MetricLabels {
  [key: string]: string | number;
}

/**
 * Zaawansowany system metryk z Prometheus support
 */
export class MetricsSystem {
  // Counters
  public wsConnectionsTotal = new Counter({
    name: 'ws_connections_total',
    help: 'Total number of WebSocket connections',
    labelNames: ['status', 'ip', 'user_agent'],
  });

  public wsMessagesTotal = new Counter({
    name: 'ws_messages_total',
    help: 'Total number of WebSocket messages processed',
    labelNames: ['type', 'lobby_id', 'action', 'status'],
  });

  public wsErrorsTotal = new Counter({
    name: 'ws_errors_total',
    help: 'Total number of WebSocket errors',
    labelNames: ['type', 'operation', 'lobby_id'],
  });

  public gameActionsTotal = new Counter({
    name: 'game_actions_total',
    help: 'Total number of game actions',
    labelNames: ['action', 'lobby_id', 'player', 'result'],
  });

  // Histograms
  public wsMessageDuration = new Histogram({
    name: 'ws_message_duration_milliseconds',
    help: 'WebSocket message processing duration',
    labelNames: ['type', 'lobby_id'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  });

  public gameActionDuration = new Histogram({
    name: 'game_action_duration_milliseconds',
    help: 'Game action processing duration',
    labelNames: ['action', 'lobby_id'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  });

  public broadcastDuration = new Histogram({
    name: 'broadcast_duration_milliseconds',
    help: 'Broadcast operation duration',
    labelNames: ['type', 'lobby_id', 'recipients'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  });

  // Gauges
  public activeConnections = new Gauge({
    name: 'ws_active_connections',
    help: 'Number of active WebSocket connections',
    labelNames: ['lobby_id'],
  });

  public activeGames = new Gauge({
    name: 'active_games',
    help: 'Number of active games',
    labelNames: ['status'],
  });

  public activeLobbies = new Gauge({
    name: 'active_lobbies',
    help: 'Number of active lobbies',
    labelNames: ['has_game'],
  });

  public memoryUsage = new Gauge({
    name: 'node_memory_usage_bytes',
    help: 'Node.js memory usage',
    labelNames: ['type'],
  });

  public cpuUsage = new Gauge({
    name: 'node_cpu_usage_percent',
    help: 'Node.js CPU usage',
    labelNames: [],
  });

  // Business metrics
  public playerTurnDuration = new Histogram({
    name: 'player_turn_duration_seconds',
    help: 'Duration of player turns',
    labelNames: ['lobby_id', 'player'],
    buckets: [1, 5, 10, 15, 30, 60],
  });

  public roundDuration = new Histogram({
    name: 'round_duration_seconds',
    help: 'Duration of game rounds',
    labelNames: ['lobby_id'],
    buckets: [30, 60, 120, 180, 300, 600],
  });

  public gameWins = new Counter({
    name: 'game_wins_total',
    help: 'Total number of game wins',
    labelNames: ['lobby_id', 'player', 'result'],
  });

  constructor() {
    // Initialize default metrics
    collectDefaultMetrics({ timeout: 5000 });

    // Update memory and CPU metrics periodically
    setInterval(() => this.updateSystemMetrics(), 10000);

    logger.info('[METRICS] System initialized');
  }

  private updateSystemMetrics() {
    const memory = process.memoryUsage();

    this.memoryUsage.set({ type: 'rss' }, memory.rss);
    this.memoryUsage.set({ type: 'heapTotal' }, memory.heapTotal);
    this.memoryUsage.set({ type: 'heapUsed' }, memory.heapUsed);
    this.memoryUsage.set({ type: 'external' }, memory.external);
    this.memoryUsage.set({ type: 'arrayBuffers' }, memory.arrayBuffers);

    // CPU usage (simplified)
    const startUsage = process.cpuUsage();
    setTimeout(() => {
      const diffUsage = process.cpuUsage(startUsage);
      const cpuPercent = (diffUsage.user + diffUsage.system) / 10000;
      this.cpuUsage.set(cpuPercent);
    }, 100);
  }

  /**
   * Increment counter z labelami
   */
  increment(name: string, value = 1, labels: MetricLabels = {}): void {
    const counter = this.getCounter(name);
    if (counter) {
      counter.inc(labels, value);
    }
  }

  /**
   * Observe histogram
   */
  observe(name: string, value: number, labels: MetricLabels = {}): void {
    const histogram = this.getHistogram(name);
    if (histogram) {
      histogram.observe(labels, value);
    }
  }

  /**
   * Set gauge value
   */
  set(name: string, value: number, labels: MetricLabels = {}): void {
    const gauge = this.getGauge(name);
    if (gauge) {
      gauge.set(labels, value);
    }
  }

  /**
   * Rate calculation (events per second)
   */
  rate(name: string, windowMs: number, labels: MetricLabels = {}): number {
    const counter = this.getCounter(name);
    if (!counter) return 0;

    // Simplified rate - w produkcji użyj sliding window
    const total = counter.total(labels);
    return total / (windowMs / 1000) || 0;
  }

  /**
   * Mean value dla histogram
   */
  mean(name: string, labels: MetricLabels = {}): number {
    const histogram = this.getHistogram(name);
    if (!histogram) return 0;

    const values = histogram.values(labels);
    if (values.length === 0) return 0;

    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Percentile dla histogram
   */
  percentile(name: string, percentile: number, labels: MetricLabels = {}): number {
    const histogram = this.getHistogram(name);
    if (!histogram) return 0;

    return histogram.percentile(labels, percentile);
  }

  /**
   * Business-specific methods
   */
  recordConnection(status: 'connected' | 'disconnected', ip: string, userAgent: string) {
    this.wsConnectionsTotal.inc({ status, ip, userAgent });
    this.activeConnections.set({ lobby_id: 'global' }, this.getActiveConnectionsCount());
  }

  recordMessage(type: string, lobbyId?: string, action?: string, status: 'success' | 'error' = 'success') {
    this.wsMessagesTotal.inc({ type, lobby_id: lobbyId || 'unknown', action, status });
  }

  recordGameAction(action: string, lobbyId: string, player: string, result?: string) {
    this.gameActionsTotal.inc({ action, lobby_id: lobbyId, player, result });
  }

  recordPlayerTurn(lobbyId: string, player: string, duration: number) {
    this.playerTurnDuration.observe({ lobby_id: lobbyId, player }, duration / 1000);
  }

  recordRound(lobbyId: string, duration: number) {
    this.roundDuration.observe({ lobby_id: lobbyId }, duration / 1000);
  }

  recordGameWin(lobbyId: string, player: string, result: 'win' | 'lose' | 'push' | 'blackjack') {
    this.gameWins.inc({ lobby_id: lobbyId, player, result });
  }

  /**
   * Health check metrics
   */
  getHealthMetrics() {
    return {
      timestamp: Date.now(),
      uptime: process.uptime(),
      activeConnections: this.getActiveConnectionsCount(),
      messageRate: this.rate('ws_messages_total', 60000),
      errorRate: this.rate('ws_errors_total', 60000),
      avgMessageTime: this.mean('ws_message_duration_milliseconds'),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };
  }

  /**
   * Prometheus metrics endpoint
   */
  async getPrometheusMetrics(): Promise<string> {
    try {
      return await register.metrics();
    } catch (error) {
      logger.error('[METRICS_ERROR]', { error: (error as Error).message });
      return '# Error generating metrics';
    }
  }

  /**
   * JSON metrics dla internal use
   */
  getJsonMetrics(): any {
    const metricsData: any = {};

    // Collect all metric families
    register.collectDefaultMetrics();

    const families = register.getMetricsAsObject();
    for (const [name, family] of Object.entries(families)) {
      metricsData[name] = family;
    }

    return {
      ...metricsData,
      system: this.getHealthMetrics(),
      business: {
        totalGames: this.gameActionsTotal.total(),
        totalWins: this.gameWins.total(),
        avgRoundTime: this.mean('round_duration_seconds') * 1000,
      },
    };
  }

  private getCounter(name: string): Counter<string> | null {
    // W rzeczywistości użyj registry lub mapy
    // Tutaj uproszczone - dodaj nowe counters w klasie
    const counters: Record<string, Counter<string>> = {
      ws_connections_total: this.wsConnectionsTotal,
      ws_messages_total: this.wsMessagesTotal,
      ws_errors_total: this.wsErrorsTotal,
      game_actions_total: this.gameActionsTotal,
      game_wins_total: this.gameWins,
    };

    return counters[name] || null;
  }

  private getHistogram(name: string): Histogram<string> | null {
    const histograms: Record<string, Histogram<string>> = {
      ws_message_duration_milliseconds: this.wsMessageDuration,
      game_action_duration_milliseconds: this.gameActionDuration,
      broadcast_duration_milliseconds: this.broadcastDuration,
      player_turn_duration_seconds: this.playerTurnDuration,
      round_duration_seconds: this.roundDuration,
    };

    return histograms[name] || null;
  }

  private getGauge(name: string): Gauge<string> | null {
    const gauges: Record<string, Gauge<string>> = {
      ws_active_connections: this.activeConnections,
      active_games: this.activeGames,
      active_lobbies: this.activeLobbies,
      node_memory_usage_bytes: this.memoryUsage,
      node_cpu_usage_percent: this.cpuUsage,
    };

    return gauges[name] || null;
  }

  private getActiveConnectionsCount(): number {
    // W realnej implementacji pobierz z ConnectionManager
    return Math.floor(Math.random() * 100) + 50; // Mock
  }
}

// Singleton instance
export const metrics = new MetricsSystem();

// Export shorthand methods
export const {
  increment: metricIncrement,
  observe: metricObserve,
  set: metricSet,
  rate: metricRate,
  mean: metricMean,
  recordConnection,
  recordMessage,
  recordGameAction,
  recordPlayerTurn,
  recordRound,
  recordGameWin,
  getHealthMetrics,
  getPrometheusMetrics,
  getJsonMetrics,
} = metrics;
