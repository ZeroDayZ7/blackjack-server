import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { setupWebSocket } from './ws/wsServer.js';
import logger from '@logger';

const PORT = env.PORT || 5000;

const server = http.createServer(app);

// konfiguracja WS
const wss = setupWebSocket(server);
app.set('wss', wss);

// global error handlers
process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('❌ Unhandled rejection:', reason);
});

server.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT} [${env.NODE_ENV}]`);
});
