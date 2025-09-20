// ws/enhancedWsServer.ts
import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';
import { WebSocketServer } from 'ws';
import type { MyWebSocket, WsMessage } from '@types';
import { routeWsMessage } from './wsRouter.js';
import { OptimizedBroadcaster } from './services/transport/OptimizedBroadcaster.js';
import { ConnectionManager } from './connectionManager.js';
import { messageLimiter } from './rateLimiter.js';
import logger from '@logger';
// import { metrics } from './metrics.js';

interface ConnectionMetrics {
  activeConnections: number;
  messageRate: number;
  errorRate: number;
  avgResponseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
}

export class EnhancedWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private connectionManager: ConnectionManager;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer) {
    super();
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      // Connection limits
      maxPayload: 100 * 1024, // 100KB
      perMessageDeflate: {
        threshold: 1024,
        concurrencyLimit: 10,
      },
    });

    this.connectionManager = new ConnectionManager();
    this.setupEventHandlers();
    this.startMetricsCollection();
  }

  public getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws: MyWebSocket, req) => {
      const ip = this.extractClientIP(req);
      const connectionId = crypto.randomUUID();

      // Create enhanced connection
      const enhancedWs = this.connectionManager.createConnection(ws, {
        id: connectionId,
        ip,
        connectedAt: new Date(),
        userAgent: req.headers['user-agent'],
      });

      logger.info(`[WS_CONNECT] New connection`, {
        connectionId,
        ip,
        userAgent: req.headers['user-agent'],
      });

      // Setup message handling
      enhancedWs.on('message', this.handleMessage.bind(this));

      enhancedWs.on('close', (code: number, reason: Buffer) => {
        this.connectionManager.removeConnection(connectionId);
        OptimizedBroadcaster.handleDisconnect(enhancedWs, this.wss);

        logger.info(`[WS_DISCONNECT] Connection closed`, {
          connectionId,
          code,
          reason: reason.toString(),
          duration: Date.now() - enhancedWs.connectedAt!.getTime(),
        });
      });

      enhancedWs.on('error', (error: Error) => {
        logger.error(`[WS_ERROR] Connection error`, {
          connectionId,
          error: error.message,
        });
        metrics.increment('ws.errors.total');
      });

      // Graceful ping/pong
      const pingInterval = setInterval(() => {
        if (enhancedWs.readyState === WebSocket.OPEN) {
          enhancedWs.ping();
        }
      }, 30000);

      enhancedWs.on('close', () => clearInterval(pingInterval));
    });

    // Global server events
    this.wss.on('error', (error) => {
      logger.error('[WS_SERVER_ERROR]', { error: error.message });
      metrics.increment('ws.server_errors.total');
    });

    // Periodic cleanup
    setInterval(() => {
      this.connectionManager.cleanupStaleConnections();
    }, 60000);
  }

  private async handleMessage(rawData: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) {
    const connection = this.connectionManager.getCurrentConnection();
    if (!connection) return;

    const startTime = process.hrtime.bigint();
    const rawString = Buffer.isBuffer(rawData)
      ? rawData.toString('utf8')
      : new TextDecoder().decode(rawData as ArrayBuffer);

    // Rate limiting
    try {
      await messageLimiter.consume(connection.metadata.ip);
    } catch {
      connection.ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Rate limit exceeded. Please slow down.',
        }),
      );
      return;
    }

    let message: WsMessage;
    try {
      message = JSON.parse(rawString) as WsMessage;
      metrics.increment('ws.messages.received.total');
    } catch (error) {
      logger.warn('[WS_INVALID_JSON]', { raw: rawString.slice(0, 100) });
      metrics.increment('ws.messages.invalid_json');
      return;
    }

    // Route message
    try {
      await routeWsMessage(connection.ws, this.wss, message);
    } catch (error) {
      logger.error('[WS_ROUTE_ERROR]', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageType: message.type,
        connectionId: connection. metadata.id,
      });
      metrics.increment('ws.messages.routing_errors');
    } finally {
      // Update metrics
      const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      metrics.observe('ws.messages.duration_ms', duration);
      metrics.increment('ws.messages.processed.total');
    }
  }

  private extractClientIP(req: any): string {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  }

  private startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      const metricsData: ConnectionMetrics = {
        activeConnections: this.connectionManager.getActiveCount(),
        messageRate: metrics.rate('ws.messages.processed.total', 60000),
        errorRate: metrics.rate('ws.errors.total', 60000),
        avgResponseTime: metrics.mean('ws.messages.duration_ms'),
        memoryUsage: process.memoryUsage(),
      };

      logger.info('[WS_METRICS]', metricsData);

      // Health check endpoint
      this.emit('metrics_update', metricsData);
    }, 30000);
  }

  // Public API
  broadcastLobbyList() {
    OptimizedBroadcaster.broadcastLobbyList(this.wss);
  }

  getMetrics(): ConnectionMetrics {
    return {
      activeConnections: this.connectionManager.getActiveCount(),
      messageRate: metrics.rate('ws.messages.processed.total', 60000),
      errorRate: metrics.rate('ws.errors.total', 60000),
      avgResponseTime: metrics.mean('ws.messages.duration_ms'),
      memoryUsage: process.memoryUsage(),
    };
  }

  shutdown() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.wss.close(() => {
      logger.info('[WS_SHUTDOWN] WebSocket server closed');
    });

    this.connectionManager.shutdown();
  }

  getWss(): WebSocketServer {
    return this.wss;
  }
}

// Metrics helper
const metrics = {
  counters: new Map<string, number>(),
  histograms: new Map<string, number[]>(),

  increment(name: string, value = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  },

  observe(name: string, value: number) {
    const values = this.histograms.get(name) || [];
    values.push(value);
    if (values.length > 1000) values.shift(); // Keep last 1000
    this.histograms.set(name, values);
  },

  rate(name: string, windowMs: number): number {
    // Simple rate calculation - implement proper sliding window
    return (this.counters.get(name) || 0) / (windowMs / 1000);
  },

  mean(name: string): number {
    const values = this.histograms.get(name) || [];
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  },
};

export const setupWebSocket = (server: HttpServer) => {
  return new EnhancedWebSocketServer(server);
};
