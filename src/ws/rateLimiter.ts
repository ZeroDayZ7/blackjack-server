// ws/rateLimiter.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';
import logger from '@logger';

export interface RateLimitConfig {
  points: number;
  duration: number; // seconds
  keyPrefix?: string;
}

export interface RateLimitMetrics {
  hits: number;
  blocked: number;
  avgWaitTime: number;
}

/**
 * Rate Limiter (Memory only)
 * - Memory dla szybkich operacji
 */
export class AdvancedRateLimiter {
  private memoryLimiter: RateLimiterMemory;
  private readonly config: RateLimitConfig;
  private metrics: RateLimitMetrics = { hits: 0, blocked: 0, avgWaitTime: 0 };
  private readonly waitTimes: number[] = [];

  constructor(config: RateLimitConfig) {
    this.config = { ...config, keyPrefix: config.keyPrefix || 'rl:' };
    this.memoryLimiter = new RateLimiterMemory(config);
  }

  /**
   * Konsumuje token z limitu
   */
  async consume(key: string): Promise<{
    success: boolean;
    remainingPoints: number;
    resetTime: number;
    waitTime?: number;
  }> {
    const startTime = Date.now();
    const rlKey = `${this.config.keyPrefix}${key}`;

    try {
      const result = await this.consumeMemory(rlKey);

      const duration = Date.now() - startTime;
      this.waitTimes.push(duration);

      // Keep only last 100 measurements
      if (this.waitTimes.length > 100) {
        this.waitTimes.shift();
      }

      this.metrics.hits++;
      this.metrics.avgWaitTime = this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length;

      return {
        success: result.success,
        remainingPoints: result.remainingPoints,
        resetTime: result.resetTime,
        waitTime: duration,
      };
    } catch (error) {
      logger.error('[RATE_LIMIT_ERROR]', {
        key,
        error: (error as Error).message,
      });

      this.metrics.blocked++;
      return {
        success: false,
        remainingPoints: 0,
        resetTime: Date.now() + this.config.duration * 1000,
        waitTime: 0,
      };
    }
  }

  private async consumeMemory(key: string) {
    const result = await this.memoryLimiter.consume(key);

    return {
      success: true,
      remainingPoints: result.remainingPoints,
      resetTime: result.msBeforeNext,
    };
  }

  /**
   * Sprawdza czy key jest zablokowany
   */
  async isBlocked(key: string): Promise<boolean> {
    try {
      const consumed = await this.memoryLimiter.consume(key, 1, { execEvenly: false });
      return !consumed;
    } catch {
      return false; // Fail open
    }
  }

  /**
   * Reset limitu dla konkretnego key
   */
  async reset(key: string): Promise<void> {
    const rlKey = `${this.config.keyPrefix}${key}`;

    await this.memoryLimiter.delete(rlKey);

    logger.debug('[RATE_LIMIT_RESET]', { key: rlKey });
  }

  /**
   * Pobiera metryki
   */
  getMetrics(): RateLimitMetrics & {
    config: RateLimitConfig;
    blockedKeys: string[];
  } {
    return {
      ...this.metrics,
      config: this.config,
      blockedKeys: [],
    };
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('[RATE_LIMITER] Shutdown complete', this.getMetrics());
  }
}

/**
 * Globalne instancje limiterów
 */
export const messageLimiter = new AdvancedRateLimiter({
  points: 30, // 30 wiadomości
  duration: 60, // na minutę
});

export const lobbyCreationLimiter = new AdvancedRateLimiter({
  points: 5,
  duration: 300, // 5 minut
});

export const gameActionLimiter = new AdvancedRateLimiter({
  points: 10,
  duration: 10, // 10 sekund
});
