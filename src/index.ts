// server.ts
import { createServer } from 'http';
import app from './app.js';
import { setupWebSocket } from './ws/enhancedWsServer.js';
import { initializeAlerts } from './monitoring/alerts.js';
import logger from './utils/logger.js';
import { ConnectionManager } from '@ws/connectionManager.js';

const httpServer = createServer(app);

// Setup WebSocket + ConnectionManager
const wss = setupWebSocket(httpServer);
globalThis.wss = wss;
const connectionManager = wss.getConnectionManager();
initializeAlerts(connectionManager);

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`[SHUTDOWN] Received ${signal}`);
  Promise.all([wss.shutdown()])
    .then(() => {
      logger.info('[SHUTDOWN] Done');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('[SHUTDOWN_ERROR]', { error: err.message });
      process.exit(1);
    });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
});
 