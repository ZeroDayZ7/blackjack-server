import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { globalLimiter } from './middleware/globalLimiter.js';
import { rateLimit } from 'express-rate-limit';
import {
  getActiveConnections,
  getAverageResponseTime,
  getErrorRate,
  getGamesMemory,
  getMemoryUsage,
} from '@ws/wsServer.js';
import { dataStore } from '@ws/data/data.js';

function bytesToMB(bytes: number) {
  return +(bytes / 1024 / 1024).toFixed(2); // np. 17.42 MB
}

const app = express();
app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    origin: '*',
    credentials: false,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(globalLimiter);

const wsUpgradeLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 20,
  message: 'Too many WebSocket connections',
});

app.use('/ws', wsUpgradeLimiter);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (_req, res) => {
  const mem = getMemoryUsage();
  const gamesMem = getGamesMemory(dataStore.getGames());
  res.json({
    activeConnections: getActiveConnections(),
    avgResponseTimeMs: `${getAverageResponseTime()} ms`,
    errorRate: getErrorRate(),
    memoryUsageMB: {
      rss: bytesToMB(mem.rss), // Resident Set Size – całkowita pamięć używana przez proces Node.js w systemie (w tym kod, stack, heap itp.)
      heapTotal: bytesToMB(mem.heapTotal), // Całkowita przydzielona pamięć dla V8 heap
      heapUsed: bytesToMB(mem.heapUsed), // Faktycznie używana pamięć w V8 heap (czyli obiekty JS)
      external: bytesToMB(mem.external), // Pamięć używana przez obiekty poza V8 (np. Buffery, C++ addony)
      arrayBuffers: bytesToMB(mem.arrayBuffers), // Pamięć zajęta przez ArrayBuffer i TypedArray
    },

    gamesMemoryMB: bytesToMB(gamesMem),
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Not found',
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);

  const message = err instanceof Error ? err.message : 'Internal Server Error';

  res.status(500).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV !== 'production' && {
      stack: err instanceof Error ? err.stack : undefined,
    }),
  });
});

export default app;
