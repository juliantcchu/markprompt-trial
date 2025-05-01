import { Effect, Context, Layer } from 'effect';
import { RateLimitStorage, RateLimitStorageService } from './rateLimiter';
import { RateLimitConfig } from '../config/ratelimit';

// ==========================================
// Rate Limiting Algorithm Strategies
// ==========================================

export interface RateLimitResult {
  isAllowed: boolean;
  remaining: number;
  resetTime: number;
}

// Define a common interface for all rate limiting strategies
export interface RateLimitStrategy {
  checkLimit: (
    key: string,
    config: RateLimitConfig
  ) => Effect.Effect<RateLimitResult, Error, RateLimitStorageService>;
}

// Strategy Tag for dependency injection
export class RateLimitStrategyService extends Context.Tag("RateLimitStrategyService")<
  RateLimitStrategyService,
  RateLimitStrategy
>() {}

// ==========================================
// 1. Fixed Window Strategy 
// ==========================================
export const createFixedWindowStrategy = (): RateLimitStrategy => ({
  checkLimit: (key: string, config: RateLimitConfig) => {
    return Effect.gen(function* (_) {
      const storage = yield* RateLimitStorageService;
      const now = Date.now();
      
      // Calculate the start of the current window
      const windowSize = config.windowMs;
      const windowStart = Math.floor(now / windowSize) * windowSize;
      
      // Fixed window specific key to ensure different windows
      const windowKey = `${key}:${windowStart}`;
      
      // Record current request
      yield* storage.recordRequest(windowKey, now, config.windowMs);
      
      // Get count of requests in the current window
      const requestCount = yield* storage.checkLimit(windowKey, windowStart, now);
      
      return {
        isAllowed: requestCount <= config.maxRequests,
        remaining: Math.max(0, config.maxRequests - requestCount),
        resetTime: windowStart + windowSize
      };
    });
  }
});

// ==========================================
// 2. Sliding Window Strategy 
// ==========================================
export const createSlidingWindowStrategy = (): RateLimitStrategy => ({
  checkLimit: (key: string, config: RateLimitConfig) => {
    return Effect.gen(function* (_) {
      const storage = yield* RateLimitStorageService;
      const now = Date.now();
      const windowStart = now - config.windowMs;
      
      // Record current request
      yield* storage.recordRequest(key, now, config.windowMs);
      
      // Get count of requests in the sliding window
      const requestCount = yield* storage.checkLimit(key, windowStart, now);
      
      return {
        isAllowed: requestCount <= config.maxRequests,
        remaining: Math.max(0, config.maxRequests - requestCount),
        resetTime: now + config.windowMs
      };
    });
  }
});

// ==========================================
// Create layers for all strategies
// ==========================================

export const FixedWindowStrategyLive = Layer.succeed(
  RateLimitStrategyService,
  createFixedWindowStrategy()
);

export const SlidingWindowStrategyLive = Layer.succeed(
  RateLimitStrategyService,
  createSlidingWindowStrategy()
);

// Default to sliding window as it's a good balance
export const DefaultStrategyLive = SlidingWindowStrategyLive; 