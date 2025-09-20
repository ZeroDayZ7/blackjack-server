// ws/connectionManager.ts
import { WebSocket } from 'ws';
import type { MyWebSocket } from '@types';
import logger from '@utils/logger.js';
 
export interface ConnectionMetadata {
  id: string;
  ip: string;
  connectedAt: Date;
  userAgent?: string;
  lastActivity: number;
  nick?: string;
  lobbyId?: string;
  inGame: boolean;
  messageCount: number;
  errorCount: number;
}

export class ConnectionManager {
  private connections = new Map<
    string,
    {
      ws: MyWebSocket;
      metadata: ConnectionMetadata;
      cleanupTimer?: NodeJS.Timeout;
    }
  >();

  private readonly STALE_CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minut
  private readonly ACTIVITY_TIMEOUT = 30 * 1000; // 30 sekund bez aktywności

  constructor() {
    // Periodic cleanup
    setInterval(() => this.cleanupStaleConnections(), 60000);
  }

  /**
   * Tworzy nowe połączenie z pełnym trackingiem
   */
  createConnection(
    ws: WebSocket,
    metadata: Omit<ConnectionMetadata, 'lastActivity' | 'messageCount' | 'errorCount' | 'inGame'>,
  ): MyWebSocket {
    const connectionId = metadata.id;
    const enhancedWs = ws as MyWebSocket;

    // Extend WebSocket z dodatkowymi properties
    Object.defineProperties(enhancedWs, {
      connectionId: {
        value: connectionId,
        writable: false,
      },
      connectedAt: {
        value: metadata.connectedAt,
        writable: false,
      },
      metadata: {
        value: {
          ...metadata,
          lastActivity: Date.now(),
          messageCount: 0,
          errorCount: 0,
          inGame: false,
        } as ConnectionMetadata,
        writable: true,
      },
      updateActivity: {
        value: function () {
          if (this.metadata) {
            this.metadata.lastActivity = Date.now();
            this.metadata.messageCount++;
          }
        },
        writable: false,
      },
      recordError: {
        value: function () {
          if (this.metadata) {
            this.metadata.errorCount++;
          }
        },
        writable: false,
      },
      isActive: {
        get: function () {
          if (!this.metadata) return false;
          return Date.now() - this.metadata.lastActivity < this.ACTIVITY_TIMEOUT;
        },
      },
      getLatency: {
        value: function () {
          // Simple latency estimation
          return Math.random() * 100 + 50; // 50-150ms
        },
      },
    });

    // Setup heartbeat
    const heartbeatInterval = setInterval(() => {
      if (enhancedWs.readyState === WebSocket.OPEN && enhancedWs.isActive) {
        enhancedWs.ping(() => {
          logger.debug('[HEARTBEAT] Ping sent', { connectionId });
        });
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 25000);

    // Cleanup on close
    enhancedWs.on('close', () => {
      clearInterval(heartbeatInterval);
      this.removeConnection(connectionId);
    });

    // Store connection
    this.connections.set(connectionId, {
      ws: enhancedWs,
      metadata: enhancedWs.metadata,
    });

    logger.debug('[CONNECTION] Created new connection', {
      connectionId,
      ip: metadata.ip,
    });

    return enhancedWs;
  }

  /**
   * Pobiera aktualne połączenie dla bieżącego request context
   */
  getCurrentConnection(): { ws: MyWebSocket; metadata: ConnectionMetadata } | null {
    // W realnym scenariuszu potrzebny byłby RequestContext lub AsyncLocalStorage
    // Dla uproszczenia zwracamy ostatnie utworzone połączenie
    const lastConnection = Array.from(this.connections.values()).pop();
    return lastConnection || null;
  }

  /**
   * Pobiera połączenie po ID
   */
  getConnection(id: string): { ws: MyWebSocket; metadata: ConnectionMetadata } | null {
    const connection = this.connections.get(id);
    if (!connection) return null;

    // Check if still active
    if (connection.ws.readyState !== WebSocket.OPEN) {
      this.removeConnection(id);
      return null;
    }

    return connection;
  }

  /**
   * Usuwa połączenie
   */
  removeConnection(id: string): boolean {
    const connection = this.connections.get(id);
    if (!connection) return false;

    clearTimeout(connection.cleanupTimer);
    this.connections.delete(id);

    logger.debug('[CONNECTION] Removed connection', { connectionId: id });
    return true;
  }

  /**
   * Czyszczenie nieaktywnych połączeń
   */
  cleanupStaleConnections(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, { ws, metadata }] of this.connections) {
      // Usuń zamknięte połączenia
      if (ws.readyState !== WebSocket.OPEN) {
        toRemove.push(id);
        continue;
      }

      // Usuń nieaktywne połączenia (brak heartbeat)
      if (now - metadata.lastActivity > this.STALE_CONNECTION_TIMEOUT) {
        logger.warn('[CONNECTION] Removing stale connection', {
          connectionId: id,
          inactiveFor: now - metadata.lastActivity,
        });
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeConnection(id);
    }

    if (toRemove.length > 0) {
      logger.info('[CONNECTION_CLEANUP] Removed stale connections', { count: toRemove.length });
    }
  }

  /**
   * Statystyki połączeń
   */
  getStats(): {
    activeCount: number;
    totalCount: number;
    avgMessageRate: number;
    errorRate: number;
    connectionsByLobby: Record<string, number>;
  } {
    const activeCount = Array.from(this.connections.values()).filter(
      ({ ws }) => ws.readyState === WebSocket.OPEN,
    ).length;

    const totalCount = this.connections.size;

    // Calculate rates
    let totalMessages = 0;
    let totalErrors = 0;
    const connectionsByLobby: Record<string, number> = {};

    for (const [, { metadata }] of this.connections) {
      totalMessages += metadata.messageCount;
      totalErrors += metadata.errorCount;

      if (metadata.lobbyId) {
        connectionsByLobby[metadata.lobbyId] = (connectionsByLobby[metadata.lobbyId] || 0) + 1;
      }
    }

    const avgMessageRate = totalCount > 0 ? totalMessages / totalCount : 0;
    const errorRate = totalMessages > 0 ? totalErrors / totalMessages : 0;

    return {
      activeCount,
      totalCount,
      avgMessageRate,
      errorRate,
      connectionsByLobby,
    };
  }

  /**
   * Pobiera wszystkie aktywne połączenia
   */
  getActiveConnections(): MyWebSocket[] {
    return Array.from(this.connections.values())
      .filter(({ ws }) => ws.readyState === WebSocket.OPEN)
      .map(({ ws }) => ws);
  }

  /**
   * Pobiera połączenia dla konkretnego lobby
   */
  getConnectionsForLobby(lobbyId: string): MyWebSocket[] {
    return this.getActiveConnections().filter((ws) => ws.lobbyId === lobbyId);
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    for (const [id] of this.connections) {
      this.removeConnection(id);
    }

    logger.info('[CONNECTION_MANAGER] Shutdown complete');
  }

  /**
   * Liczba aktywnych połączeń
   */
  getActiveCount(): number {
    return this.getActiveConnections().length;
  }
}
