import { Layer, Effect, Context } from 'effect';
import { UserIdentity } from '../ratelimiter/rateLimiter';
import { RedisClient } from '../ratelimiter/redis';

// Rate limit configuration
export type UserRole = 'free' | 'premium' | 'admin';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
}

// Config service interface
export interface RateLimitConfigService {
  getRateLimitConfig: (identity: UserIdentity) => Effect.Effect<RateLimitConfig, Error>;
  setUserRateLimit: (userId: string, config: RateLimitConfig) => Effect.Effect<void, Error>;
}

// Define the config provider tag
export class RateLimitConfigProvider extends Context.Tag("RateLimitConfigProvider")<
  RateLimitConfigProvider,
  RateLimitConfigService
>() {}

// Configure different rate limits for different user roles
export const rateLimitByRole: Record<UserRole, RateLimitConfig> = {
  free: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  },
  premium: {
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
  },
  admin: {
    maxRequests: 1000,
    windowMs: 60 * 1000, // 1 minute
  },
};

// Default rate limit for unauthenticated users
export const defaultRateLimit: RateLimitConfig = {
  maxRequests: 5,
  windowMs: 60 * 1000, // 1 minute
};

// User overrides store - kept for backward compatibility but no longer the primary storage
export const userOverrides: Record<string, RateLimitConfig> = {};

// Redis key prefix for user overrides
const USER_OVERRIDE_PREFIX = 'rate-limit-override:';

// Create config service layer with Redis support
export const RateLimitConfigLive = Layer.effect(
  RateLimitConfigProvider,
  Effect.gen(function* (_) {
    // Try to get Redis client, if available
    const redisOption = yield* Effect.serviceOption(RedisClient);
    const hasRedis = redisOption._tag === 'Some' && redisOption.value.isConnected;
    const redis = hasRedis ? redisOption.value.client : null;
    
    console.log(`Config service initialized with Redis storage: ${hasRedis}`);
    
    return {
      getRateLimitConfig: (identity: UserIdentity): Effect.Effect<RateLimitConfig, Error> => {
        return Effect.gen(function* (_) {
          // If we have a user ID, check for overrides in Redis first
          if (identity.userId && hasRedis) {
            try {
              const key = `${USER_OVERRIDE_PREFIX}${identity.userId}`;
              const overrideData = yield* Effect.tryPromise({
                try: () => redis.get(key),
                catch: (error) => new Error(`Redis override fetch error: ${error}`)
              });
              
              if (overrideData) {
                try {
                  const override = JSON.parse(overrideData as string);
                  return override as RateLimitConfig;
                } catch (e) {
                  console.error('Error parsing Redis override data:', e);
                }
              }
            } catch (err) {
              console.error('Redis override fetch error:', err);
              // Continue to next fallback
            }
          }
          
          // Then check in-memory overrides (legacy fallback)
          if (identity.userId && userOverrides[identity.userId]) {
            return userOverrides[identity.userId];
          }

          // Get limit by role
          if (identity.role && rateLimitByRole[identity.role as keyof typeof rateLimitByRole]) {
            return rateLimitByRole[identity.role as keyof typeof rateLimitByRole];
          }

          // Default rate limit
          return defaultRateLimit;
        });
      },
      
      setUserRateLimit: (userId: string, config: RateLimitConfig): Effect.Effect<void, Error> => {
        return Effect.gen(function* (_) {
          // Always update in-memory store as fallback
          userOverrides[userId] = config;
          
          // Store in Redis if available
          if (hasRedis) {
            try {
              const key = `${USER_OVERRIDE_PREFIX}${userId}`;
              const overrideData = JSON.stringify(config);
              
              // Store with a long TTL (30 days - can adjust as needed)
              yield* Effect.tryPromise({
                try: () => redis.set(key, overrideData, { EX: 30 * 24 * 60 * 60 }),
                catch: (error) => new Error(`Redis override storage error: ${error}`)
              });
              
              console.log(`Rate limit override for ${userId} stored in Redis`);
            } catch (err) {
              console.error('Redis override storage error:', err);
              // Continue execution even if Redis fails
            }
          }
        });
      }
    };
  })
); 