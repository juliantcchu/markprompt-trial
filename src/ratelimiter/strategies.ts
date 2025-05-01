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
// 3. Token Bucket Strategy 
// ==========================================
export const createTokenBucketStrategy = (refillRate: number = 1): RateLimitStrategy => ({
  checkLimit: (key: string, config: RateLimitConfig) => {
    return Effect.gen(function* (_) {
      const storage = yield* RateLimitStorageService;
      const now = Date.now();
      const tokenBucketKey = `${key}:tokenbucket`;
      
      // Get the current bucket state or create a new one
      const bucketStateEffect = Effect.gen(function* (_) {
        // Try to get current bucket state
        const bucketData = yield* storage.getState(tokenBucketKey);
        
        if (!bucketData) {
          // New bucket: full tokens and current timestamp
          return { tokens: config.maxRequests, lastRefill: now };
        }
        
        try {
          return JSON.parse(bucketData);
        } catch (e) {
          // If corrupted, create a new bucket
          return { tokens: config.maxRequests, lastRefill: now };
        }
      }).pipe(
        Effect.catchAll(error => Effect.succeed({ tokens: config.maxRequests, lastRefill: now }))
      );
      
      const bucketState = yield* bucketStateEffect;
      
      // Calculate tokens to add based on time elapsed since last refill
      const elapsedMs = now - bucketState.lastRefill;
      const tokensToAdd = Math.floor(elapsedMs * (refillRate / 1000) * config.maxRequests / (config.windowMs / 1000));
      
      // Refill tokens (up to max capacity)
      const newTokenCount = Math.min(
        config.maxRequests, 
        bucketState.tokens + tokensToAdd
      );
      
      // Check if we have enough tokens
      const isAllowed = newTokenCount >= 1;
      
      // If allowed, consume a token
      const finalTokenCount = isAllowed ? newTokenCount - 1 : newTokenCount;
      
      // Save new bucket state
      const newBucketState = {
        tokens: finalTokenCount,
        lastRefill: now
      };
      
      yield* storage.setState(
        tokenBucketKey, 
        JSON.stringify(newBucketState), 
        Math.ceil(config.windowMs / 1000)
      );
      
      // Calculate when the bucket will be refilled
      const msUntilNextToken = isAllowed ? 0 : (1 / refillRate) * 1000;
      
      return {
        isAllowed,
        remaining: finalTokenCount,
        resetTime: now + msUntilNextToken
      };
    }).pipe(
      Effect.catchAll(error => {
        console.error('Token bucket error:', error);
        // On error, allow the request (fail open)
        return Effect.succeed({
          isAllowed: true,
          remaining: 0,
          resetTime: Date.now() + config.windowMs
        });
      })
    );
  }
});

// ==========================================
// 4. Leaky Bucket Strategy 
// ==========================================
export const createLeakyBucketStrategy = (): RateLimitStrategy => ({
  checkLimit: (key: string, config: RateLimitConfig) => {
    return Effect.gen(function* (_) {
      const storage = yield* RateLimitStorageService;
      const now = Date.now();
      const leakyBucketKey = `${key}:leakybucket`;
      
      // Get the current bucket state or create a new one
      const bucketStateEffect = Effect.gen(function* (_) {
        // Try to get current bucket state
        const bucketData = yield* storage.getState(leakyBucketKey);
        
        if (!bucketData) {
          // New bucket: zero items and current timestamp
          return { items: 0, lastLeakTime: now };
        }
        
        try {
          return JSON.parse(bucketData);
        } catch (e) {
          // If corrupted, create a new bucket
          return { items: 0, lastLeakTime: now };
        }
      }).pipe(
        Effect.catchAll(error => Effect.succeed({ items: 0, lastLeakTime: now }))
      );
      
      const bucketState = yield* bucketStateEffect;
      
      // Calculate the processing/leak rate (items per ms)
      const processRate = config.maxRequests / config.windowMs;
      
      // Calculate items leaked since last request
      const elapsedMs = now - bucketState.lastLeakTime;
      const itemsLeaked = Math.floor(elapsedMs * processRate);
      
      // Update bucket state after leaking
      const currentItems = Math.max(0, bucketState.items - itemsLeaked);
      
      // Check if adding one more item would overflow the bucket
      const isAllowed = currentItems < config.maxRequests;
      
      // Update bucket state with new request if allowed
      const newItems = isAllowed ? currentItems + 1 : currentItems;
      
      // Save new bucket state
      const newBucketState = {
        items: newItems,
        lastLeakTime: now
      };
      
      yield* storage.setState(
        leakyBucketKey, 
        JSON.stringify(newBucketState), 
        Math.ceil(config.windowMs / 1000)
      );
      
      // Calculate when the bucket will have space again
      const msUntilNextSpace = isAllowed ? 0 : (1 / processRate);
      
      return {
        isAllowed,
        remaining: config.maxRequests - newItems,
        resetTime: now + msUntilNextSpace
      };
    }).pipe(
      Effect.catchAll(error => {
        console.error('Leaky bucket error:', error);
        // On error, allow the request (fail open)
        return Effect.succeed({
          isAllowed: true,
          remaining: 0,
          resetTime: Date.now() + config.windowMs
        });
      })
    );
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

export const TokenBucketStrategyLive = Layer.succeed(
  RateLimitStrategyService,
  createTokenBucketStrategy()
);

export const LeakyBucketStrategyLive = Layer.succeed(
  RateLimitStrategyService,
  createLeakyBucketStrategy()
);

// Default to sliding window as it's a good balance
export const DefaultStrategyLive = SlidingWindowStrategyLive; 