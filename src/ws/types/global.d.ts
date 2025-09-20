// types/global.d.ts
import type { WebSocketServer } from 'ws';
import type { ConnectionManager } from '../ws/connectionManager';

declare global {
  var wss: EnhancedWebSocketServer;
}
