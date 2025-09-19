import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { routeWsMessage } from './wsRouter.js';
import type { MyWebSocket, WsMessage } from '@ws/types/index.js';
import { handleDisconnect } from './services/transport/BroadcasterLobby.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import logger from '@logger';
import { GameService } from './services/gameService.js';

let activeConnections = 0;
let messageCount = 0;
let totalResponseTimeMs = 0;
let errorCount = 0;
// limiter: max 10 wiadomości na sekundę per IP
const messageLimiter = new RateLimiterMemory({
  points: 10,
  duration: 1,
});

export const setupWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: MyWebSocket, req) => {
    activeConnections++;
    const ip = req.socket.remoteAddress || 'unknown';
    logger.info(`✅ New WS connection from ${ip}`);

    ws.on('message', async (raw: Buffer, isBinary: boolean) => {
      const start = Date.now();
      const rawString = isBinary ? raw.toString('utf8') : raw.toString();

      try {
        await messageLimiter.consume(ip);
      } catch {
        ws.send(JSON.stringify({ error: 'Too many messages, slow down!' }));
        logger.warn(`🚫 Rate limit exceeded for ${ip}`);
        return;
      }

      logger.info('📨 [wsServer] Raw WS message received', { raw: rawString });

      let data: WsMessage;
      try {
        data = JSON.parse(rawString) as WsMessage;
      } catch (err) {
        errorCount++;
        logger.warn('❌ [wsServer] Invalid JSON received', { raw: rawString, error: err });
        return;
      }

      // przypisz nick, jeśli jeszcze nie ma
      if (!ws.nick && data.nick) {
        ws.nick = data.nick;
        logger.info(`🟢 [wsServer] WS nick set to ${ws.nick}`);
      }

      try {
        routeWsMessage(ws, wss, data);
      } catch (err) {
        logger.error('❌ [wsServer] Error handling WS message', { data, error: err });
      }

      const duration = Date.now() - start;
      messageCount++;
      totalResponseTimeMs += duration;
    });

    ws.on('close', () => {
      activeConnections--;
      logger.info(
        `❌ \n[wsServer] WS disconnected: ${ws.nick || 'unknown nick'}\nTotal Connection: ${activeConnections}`,
      );
      handleDisconnect(ws, wss);
    });

    ws.on('error', (err) => {
      logger.error('❌ [wsServer] WS error', { error: err, nick: ws.nick });
    });
  });

  logger.info('🌐 [wsServer] WebSocket server initialized at /ws');

  return wss;
};
export const getActiveConnections = () => activeConnections;
export const getAverageResponseTime = () => (messageCount === 0 ? 0 : totalResponseTimeMs / messageCount);
export const getErrorRate = () => {
  return messageCount === 0 ? 0 : errorCount / messageCount;
};
export const getMemoryUsage = () => process.memoryUsage(); // całkowita pamięć Node.js
export const getGamesMemory = (games: Record<string, GameService>) => {
  let size = 0;
  for (const g of Object.values(games)) {
    size += JSON.stringify(g).length;
  }
  return size; // w bajtach
};
