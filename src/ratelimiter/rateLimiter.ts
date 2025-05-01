import { Effect, Context } from 'effect';
import { 
  RateLimitConfig, 
  defaultRateLimit, 
  rateLimitByRole, 
  userOverrides,
  RateLimitConfigService, 
  RateLimitConfigProvider 
} from '../config/ratelimit';

export interface RateLimitResult {
  isAllowed: boolean;
  remaining: number;
  resetTime: number;
}

export interface UserIdentity {
  userId?: string;
  role?: string;
  ip: string;
}

// Storage interface for rate limiting
export interface RateLimitStorage {
  checkLimit: (key: string, windowMs: number, now: number) => Effect.Effect<number>;
  recordRequest: (key: string, timestamp: number, windowMs: number) => Effect.Effect<void>;
  
  // Added for token bucket and leaky bucket algorithms
  getState: (key: string) => Effect.Effect<string | null>;
  setState: (key: string, value: string, ttlSeconds: number) => Effect.Effect<void>;
}

// Define service tags
export class RateLimitStorageService extends Context.Tag("RateLimitStorageService")<
  RateLimitStorageService,
  RateLimitStorage
>() {}

// Get rate limit config for a user - default implementation (removed since now handled by the config service)

// Check rate limit using Effect
export const checkRateLimit = (
  key: string, 
  config: RateLimitConfig
): Effect.Effect<RateLimitResult, Error, RateLimitStorageService> => {
  return Effect.gen(function* (_) {
    const storage = yield* RateLimitStorageService;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Record current request
    yield* storage.recordRequest(key, now, config.windowMs);
    
    // Get count of requests in the current window
    const requestCount = yield* storage.checkLimit(key, windowStart, now);
    
    return {
      isAllowed: requestCount <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - requestCount),
      resetTime: now + config.windowMs
    };
  }).pipe(
    Effect.catchAll((error: Error) => {
      console.error('Rate limit check error:', error);
      // On error, allow the request (fail open)
      return Effect.succeed({
        isAllowed: true,
        remaining: 0,
        resetTime: Date.now() + defaultRateLimit.windowMs
      });
    })
  );
};

// Set rate limit override for a specific user
export const setUserRateLimit = (
  userId: string, 
  config: RateLimitConfig
): Effect.Effect<void, Error, RateLimitConfigProvider> => {
  return Effect.gen(function* (_) {
    const configService = yield* RateLimitConfigProvider;
    yield* configService.setUserRateLimit(userId, config);
  });
}; 