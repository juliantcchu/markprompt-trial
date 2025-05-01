import { Effect, Context, Layer } from 'effect';
import { 
  UserIdentity, 
  RateLimitResult, 
  checkRateLimit, 
  RateLimitStorageService
} from '../ratelimiter/rateLimiter';
import { RateLimitConfigLive, RateLimitConfigProvider } from '../config/ratelimit';
import { RedisClientLive, RedisStorageLive, InMemoryStorageLive } from '../ratelimiter/redis';
import {
  RateLimitStrategyService,
  FixedWindowStrategyLive,
  SlidingWindowStrategyLive,
  TokenBucketStrategyLive,
  LeakyBucketStrategyLive,
  DefaultStrategyLive
} from '../ratelimiter/strategies';

// Extract bearer token from authorization header
const extractBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

// Mock function to get user from token - in a real app, this would validate the token
// and fetch user info from a database
const getUserFromToken = (token: string): { id: string, role: string } | null => {
  // Mock implementation - replace with actual authentication logic
  if (token === 'test-free-user') {
    return { id: 'user-1', role: 'free' };
  } else if (token === 'test-premium-user') {
    return { id: 'user-2', role: 'premium' };
  } else if (token === 'test-admin-user') {
    return { id: 'admin-1', role: 'admin' };
  }
  return null;
};

// Rate limit middleware
export const rateLimitMiddleware = (req: Request): Effect.Effect<{ 
  rateLimit: RateLimitResult, 
  identity: UserIdentity 
}, Error, RateLimitStorageService | RateLimitConfigProvider | RateLimitStrategyService> => {
  return Effect.gen(function* (_) {
    // Get client IP
    const ip = req.headers.get('x-forwarded-for') || 
               req.headers.get('cf-connecting-ip') || 
               'unknown-ip';

    // Get authorization header
    const authHeader = req.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    
    // Get user info if token exists
    const user = token ? getUserFromToken(token) : null;
    
    // Create user identity
    const identity: UserIdentity = {
      userId: user?.id,
      role: user?.role,
      ip: ip as string
    };
    
    // Get config service
    const configService = yield* RateLimitConfigProvider;
    
    // Get rate limit configuration for this user
    const config = configService.getRateLimitConfig(identity);
    
    // Create key for rate limiting (combine user ID or IP with path)
    const path = new URL(req.url).pathname;
    const rateLimitKey = `ratelimit:${identity.userId || ip}:${path}`;
    
    // Get the strategy service
    const strategyService = yield* RateLimitStrategyService;
    
    // Check rate limit using the current strategy
    const rateLimit = yield* strategyService.checkLimit(rateLimitKey, config);
    
    return { rateLimit, identity };
  });
};

// Apply rate limit headers to response
export const applyRateLimitHeaders = (
  response: Response, 
  rateLimit: RateLimitResult
): Response => {
  const remainingSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
  
  response.headers.set('X-RateLimit-Limit', rateLimit.remaining + (rateLimit.isAllowed ? 1 : 0) + '');
  response.headers.set('X-RateLimit-Remaining', rateLimit.remaining + '');
  response.headers.set('X-RateLimit-Reset', Math.floor(rateLimit.resetTime / 1000) + '');
  
  if (!rateLimit.isAllowed) {
    response.headers.set('Retry-After', remainingSeconds + '');
  }
  
  return response;
};

// Create combined layers with all rate limiting dependencies

// 1. Redis-based layers with different strategies
export const RateLimitFixedWindowLive = RedisClientLive.pipe(
  Layer.provideMerge(RedisStorageLive),
  Layer.provideMerge(RateLimitConfigLive),
  Layer.provideMerge(FixedWindowStrategyLive)
);

export const RateLimitSlidingWindowLive = RedisClientLive.pipe(
  Layer.provideMerge(RedisStorageLive),
  Layer.provideMerge(RateLimitConfigLive),
  Layer.provideMerge(SlidingWindowStrategyLive)
);

export const RateLimitTokenBucketLive = RedisClientLive.pipe(
  Layer.provideMerge(RedisStorageLive),
  Layer.provideMerge(RateLimitConfigLive),
  Layer.provideMerge(TokenBucketStrategyLive)
);

export const RateLimitLeakyBucketLive = RedisClientLive.pipe(
  Layer.provideMerge(RedisStorageLive),
  Layer.provideMerge(RateLimitConfigLive),
  Layer.provideMerge(LeakyBucketStrategyLive)
);

// 2. In-memory based layers with different strategies
export const RateLimitFixedWindowInMemoryLive = Layer.merge(
  InMemoryStorageLive,
  Layer.merge(RateLimitConfigLive, FixedWindowStrategyLive)
);

export const RateLimitSlidingWindowInMemoryLive = Layer.merge(
  InMemoryStorageLive,
  Layer.merge(RateLimitConfigLive, SlidingWindowStrategyLive)
);

export const RateLimitTokenBucketInMemoryLive = Layer.merge(
  InMemoryStorageLive,
  Layer.merge(RateLimitConfigLive, TokenBucketStrategyLive)
);

export const RateLimitLeakyBucketInMemoryLive = Layer.merge(
  InMemoryStorageLive,
  Layer.merge(RateLimitConfigLive, LeakyBucketStrategyLive)
);

// Default layers (sliding window is a good default)
export const RateLimitLive = RateLimitSlidingWindowLive;
export const RateLimitInMemoryLive = RateLimitSlidingWindowInMemoryLive;

// Helper function to choose a rate limit layer based on strategy and storage type
export type RateLimitAlgorithm = 'fixed-window' | 'sliding-window' | 'token-bucket' | 'leaky-bucket';

export const getRateLimitLayer = (
  algorithm: RateLimitAlgorithm = 'sliding-window', 
  useRedis: boolean = true
): Layer.Layer<RateLimitStorageService | RateLimitConfigProvider | RateLimitStrategyService> => {
  if (useRedis) {
    switch (algorithm) {
      case 'fixed-window': return RateLimitFixedWindowLive;
      case 'token-bucket': return RateLimitTokenBucketLive;
      case 'leaky-bucket': return RateLimitLeakyBucketLive;
      case 'sliding-window':
      default: return RateLimitSlidingWindowLive;
    }
  } else {
    switch (algorithm) {
      case 'fixed-window': return RateLimitFixedWindowInMemoryLive;
      case 'token-bucket': return RateLimitTokenBucketInMemoryLive;
      case 'leaky-bucket': return RateLimitLeakyBucketInMemoryLive;
      case 'sliding-window':
      default: return RateLimitSlidingWindowInMemoryLive;
    }
  }
}; 