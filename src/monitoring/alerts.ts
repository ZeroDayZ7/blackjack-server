// monitoring/alerts.js
import { metrics } from '../ws/metrics.js';
import logger from '../utils/logger.js'
import { dataStore } from '../ws/data/transactionalDataStore.js';
import { ConnectionManager } from '../ws/connectionManager.js';

export class AlertSystem {
  private static instance: AlertSystem;
  private connectionManager: ConnectionManager;
  private alerts: Array<{
    id: string;
    name: string;
    condition: () => boolean;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    recoveryMessage?: string;
    notifyChannels?: string[];
    lastTriggered?: number;
    cooldownMs?: number;
  }> = [];

  private constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.setupAlerts();
    this.startMonitoring();
  }

  static initialize(connectionManager: ConnectionManager) {
    if (!this.instance) {
      this.instance = new this(connectionManager);
    }
    return this.instance;
  }

  static getInstance(): AlertSystem {
    if (!this.instance) {
      throw new Error('AlertSystem not initialized');
    }
    return this.instance;
  }

  private setupAlerts() {
    this.alerts = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: () => metrics.rate('ws_errors_total', 60000) > 5,
        severity: 'critical',
        message: 'WebSocket error rate too high (>5 errors/min)',
        recoveryMessage: 'Error rate returned to normal',
        notifyChannels: ['slack', 'email', 'pagerduty'],
        cooldownMs: 5 * 60 * 1000, // 5 minutes
      },
      {
        id: 'memory_pressure',
        name: 'Memory Pressure',
        condition: () => {
          const memory = process.memoryUsage();
          return memory.heapUsed > 400 * 1024 * 1024; // 400MB
        },
        severity: 'warning',
        message: 'High memory usage detected',
        recoveryMessage: 'Memory usage normalized',
        notifyChannels: ['slack', 'email'],
        cooldownMs: 2 * 60 * 1000, // 2 minutes
      },
      {
        id: 'connection_spike',
        name: 'Connection Spike',
        condition: () => this.connectionManager.getActiveCount() > 1000,
        severity: 'warning',
        message: 'Connection spike detected (>1000 concurrent connections)',
        recoveryMessage: 'Connection count normalized',
        notifyChannels: ['slack'],
        cooldownMs: 1 * 60 * 1000, // 1 minute
      },
      {
        id: 'game_stuck',
        name: 'Stuck Game',
        condition: () => {
          // Check for games stuck in player_turn > 5 minutes
          const now = Date.now();
          const games = dataStore.getGames();

          return Object.values(games).some((game) => {
            const state = game.getState();
            return state.gameStatus === 'player_turn' && now - (game as any).lastActionTime > 5 * 60 * 1000;
          });
        },
        severity: 'critical',
        message: 'Game appears to be stuck in player turn',
        recoveryMessage: 'Stuck game resolved',
        notifyChannels: ['slack', 'email'],
        cooldownMs: 10 * 60 * 1000, // 10 minutes
      },
      {
        id: 'lobby_full',
        name: 'Full Lobbies',
        condition: () => {
          const lobbies = dataStore.getLobbies();
          const fullLobbies = lobbies.filter((l) => l.players.length >= l.maxPlayers && !l.started);
          return fullLobbies.length > 10; // >10 full lobbies
        },
        severity: 'warning',
        message: `Too many full lobbies (${fullLobbies.length})`,
        recoveryMessage: 'Lobby capacity normalized',
        notifyChannels: ['slack'],
        cooldownMs: 5 * 60 * 1000,
      },
      {
        id: 'slow_response',
        name: 'Slow Response Times',
        condition: () => metrics.mean('ws_message_duration_milliseconds') > 100,
        severity: 'warning',
        message: 'Response times above 100ms average',
        recoveryMessage: 'Response times improved',
        notifyChannels: ['slack'],
        cooldownMs: 2 * 60 * 1000,
      },
    ];

    logger.info(`[ALERTS] Initialized ${this.alerts.length} alert rules`);
  }

  private startMonitoring() {
    // Check every 30 seconds
    setInterval(() => this.checkAlerts(), 30000);

    // Immediate check
    setImmediate(() => this.checkAlerts());
  }

  private async checkAlerts() {
    const now = Date.now();
    const triggered: string[] = [];

    for (const alert of this.alerts) {
      const shouldTrigger = alert.condition();
      const lastTriggered = alert.lastTriggered || 0;
      const cooldownPassed = now - lastTriggered > (alert.cooldownMs || 0);

      if (shouldTrigger && cooldownPassed) {
        await this.triggerAlert(alert);
        triggered.push(alert.id);
        alert.lastTriggered = now;
      } else if (!shouldTrigger && lastTriggered > 0) {
        // Check for recovery
        await this.checkRecovery(alert);
      }
    }

    if (triggered.length > 0) {
      logger.warn(`[ALERTS] Triggered ${triggered.length} alerts`, { triggered });
    }
  }

  private async triggerAlert(alert: (typeof this.alerts)[0]) {
    const alertData = {
      id: alert.id,
      name: alert.name,
      severity: alert.severity,
      message: alert.message,
      timestamp: new Date().toISOString(),
      details: this.getAlertDetails(alert),
      source: 'blackjack-ws',
      environment: process.env.NODE_ENV || 'development',
    };

    logger[alert.severity === 'critical' ? 'error' : 'warn'](
      `[ALERT:${alert.severity.toUpperCase()}] ${alert.name}`,
      alertData,
    );

    // Notify channels
    await Promise.allSettled(alert.notifyChannels?.map((channel) => this.notifyChannel(channel, alertData)) || []);

    // Record metric
    metrics.increment(`alerts_triggered_total`, 1, {
      alert_id: alert.id,
      severity: alert.severity,
    });
  }

  private async checkRecovery(alert: (typeof this.alerts)[0]) {
    if (!alert.lastTriggered || !alert.recoveryMessage) return;

    const recovered = !alert.condition();
    if (recovered) {
      logger.info(`[RECOVERY] ${alert.name} recovered`, {
        id: alert.id,
        message: alert.recoveryMessage,
        timestamp: new Date().toISOString(),
      });

      // Clear last triggered
      alert.lastTriggered = 0;

      // Notify recovery
      await this.notifyRecovery(alert);
    }
  }

  private getAlertDetails(alert: (typeof this.alerts)[0]) {
    const details: any = {};

    switch (alert.id) {
      case 'high_error_rate':
        details.errorRate = metrics.rate('ws_errors_total', 60000);
        details.recentErrors = metrics.getJsonMetrics().ws_errors_total;
        break;

      case 'memory_pressure':
        const memory = process.memoryUsage();
        details.heapUsedMB = Math.round(memory.heapUsed / 1024 / 1024);
        details.heapTotalMB = Math.round(memory.heapTotal / 1024 / 1024);
        break;

      case 'connection_spike':
        details.activeConnections = this.connectionManager.getActiveCount();
        details.connectionStats = this.connectionManager.getStats();
        break;

      case 'game_stuck':
        const games = dataStore.getGames();
        details.stuckGames = Object.entries(games)
          .filter(([id, game]) => {
            const state = game.getState();
            return state.gameStatus === 'player_turn';
          })
          .map(([id]) => id);
        break;

      case 'lobby_full':
        const lobbies = dataStore.getLobbies();
        details.fullLobbies = lobbies
          .filter((l) => l.players.length >= l.maxPlayers && !l.started)
          .map((l) => ({ id: l.id, name: l.name, players: l.players.length }));
        break;

      case 'slow_response':
        details.avgResponseTime = metrics.mean('ws_message_duration_milliseconds');
        details.p95ResponseTime = metrics.percentile('ws_message_duration_milliseconds', 95);
        break;
    }

    return details;
  }

  private async notifyChannel(channel: string, alertData: any): Promise<void> {
    try {
      switch (channel) {
        case 'slack':
          await this.notifySlack(alertData);
          break;
        case 'email':
          await this.notifyEmail(alertData);
          break;
        case 'pagerduty':
          await this.notifyPagerDuty(alertData);
          break;
        default:
          logger.warn('[NOTIFY] Unknown channel', { channel });
      }
    } catch (error) {
      logger.error('[NOTIFY_ERROR]', {
        channel,
        error: (error as Error).message,
        alertId: alertData.id,
      });
    }
  }

  private async notifySlack(alertData: any): Promise<void> {
    // Mock Slack notification
    const slackMessage = {
      channel: '#alerts',
      text: `🚨 *${alertData.name}* (${alertData.severity.toUpperCase()})`,
      attachments: [
        {
          color: alertData.severity === 'critical' ? 'danger' : alertData.severity === 'warning' ? 'warning' : 'good',
          fields: [
            { title: 'Message', value: alertData.message, short: false },
            { title: 'Timestamp', value: alertData.timestamp, short: true },
            { title: 'Environment', value: alertData.environment, short: true },
          ],
          ...(alertData.details &&
            Object.keys(alertData.details).length > 0 && {
              fields: [
                ...(Object.entries(alertData.details) as any[]).slice(0, 10).map(([key, value]) => ({
                  title: key,
                  value: typeof value === 'object' ? JSON.stringify(value).slice(0, 100) : value,
                  short: true,
                })),
              ],
            }),
        },
      ],
    };

    logger.info('[SLACK_NOTIFY]', {
      message: slackMessage.text,
      alertId: alertData.id,
      // W rzeczywistości wyślij do Slack webhook
    });

    // TODO: Implement actual Slack webhook
    // await fetch(process.env.SLACK_WEBHOOK_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(slackMessage),
    // });
  }

  private async notifyEmail(alertData: any): Promise<void> {
    // Mock email notification
    const email = {
      to: 'ops@blackjack.com',
      subject: `[ALERT ${alertData.severity.toUpperCase()}] ${alertData.name}`,
      html: `
        <h2>${alertData.name}</h2>
        <p><strong>Severity:</strong> ${alertData.severity.toUpperCase()}</p>
        <p><strong>Message:</strong> ${alertData.message}</p>
        <p><strong>Time:</strong> ${alertData.timestamp}</p>
        <pre>${JSON.stringify(alertData.details, null, 2)}</pre>
      `,
    };

    logger.info('[EMAIL_NOTIFY]', {
      to: email.to,
      subject: email.subject,
      alertId: alertData.id,
    });

    // TODO: Implement email sending
    // await sendEmail(email);
  }

  private async notifyPagerDuty(alertData: any): Promise<void> {
    if (alertData.severity !== 'critical') return;

    const pdEvent = {
      routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
      event_action: 'trigger',
      payload: {
        summary: `${alertData.name} - ${alertData.message}`,
        severity: alertData.severity,
        source: 'blackjack-ws',
        component: 'websocket-server',
        timestamp: alertData.timestamp,
        custom_details: alertData.details,
      },
    };

    logger.info('[PAGERDUTY_NOTIFY]', {
      summary: pdEvent.payload.summary,
      alertId: alertData.id,
    });

    // TODO: Send to PagerDuty
    // await fetch('https://events.pagerduty.com/v2/enqueue', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(pdEvent),
    // });
  }

  private async notifyRecovery(alert: (typeof this.alerts)[0]) {
    const recoveryData = {
      id: alert.id,
      name: alert.name,
      severity: alert.severity,
      message: alert.recoveryMessage || `Recovery detected for ${alert.name}`,
      timestamp: new Date().toISOString(),
      source: 'blackjack-ws',
    };

    logger.info(`[RECOVERY] ${alert.name}`, recoveryData);

    // Notify recovery on lower channels
    await Promise.allSettled(
      (alert.notifyChannels || [])
        .filter((c) => c !== 'pagerduty')
        .map((channel) => this.notifyChannel(channel, recoveryData)),
    );

    metrics.increment('alerts_recovered_total', 1, { alert_id: alert.id });
  }

  /**
   * Manual trigger alert (dla testing)
   */
  static triggerManualAlert(alertId: string, customMessage?: string) {
    const instance = this.getInstance();
    const alert = instance.alerts.find((a) => a.id === alertId);

    if (!alert) {
      logger.warn('[MANUAL_ALERT] Alert not found', { alertId });
      return;
    }

    const alertData = {
      ...alert,
      message: customMessage || alert.message,
      manuallyTriggered: true,
      timestamp: new Date().toISOString(),
      details: instance.getAlertDetails(alert),
    };

    instance.triggerAlert(alertData);
  }

  /**
   * Get alert status
   */
  getAlertStatus() {
    const now = Date.now();
    return {
      timestamp: new Date().toISOString(),
      activeAlerts: this.alerts
        .filter((a) => a.lastTriggered && now - (a.lastTriggered || 0) < (a.cooldownMs || 300000))
        .map((a) => ({
          id: a.id,
          name: a.name,
          severity: a.severity,
          lastTriggered: a.lastTriggered ? new Date(a.lastTriggered).toISOString() : null,
          cooldownUntil: a.lastTriggered ? new Date(a.lastTriggered + (a.cooldownMs || 0)).toISOString() : null,
        })),
      totalRules: this.alerts.length,
      systemHealth: metrics.getHealthMetrics(),
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    logger.info('[ALERTS] Shutting down monitoring...');
    // Cleanup timers etc.
  }
}

// Initialize when ConnectionManager is ready
let alertSystem: AlertSystem | null = null;

export const initializeAlerts = (connectionManager: ConnectionManager) => {
  if (!alertSystem) {
    alertSystem = AlertSystem.initialize(connectionManager);
  }
  return alertSystem;
};

export const getAlertSystem = () => {
  if (!alertSystem) {
    throw new Error('AlertSystem not initialized');
  }
  return alertSystem;
};

// Export for convenience
export const { triggerManualAlert, getAlertStatus } = AlertSystem;
