import { Layer, Effect, Context } from 'effect';
import { UserIdentity } from '../ratelimiter/rateLimiter';

// Rate limit configuration
export type UserRole = 'free' | 'premium' | 'admin';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
}

// Config service interface
export interface RateLimitConfigService {
  getRateLimitConfig: (identity: UserIdentity) => RateLimitConfig;
  setUserRateLimit: (userId: string, config: RateLimitConfig) => Effect.Effect<void>;
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

// User overrides store
export const userOverrides: Record<string, RateLimitConfig> = {};

// Create config service layer
export const RateLimitConfigLive = Layer.succeed(
  RateLimitConfigProvider,
  {
    getRateLimitConfig: (identity: UserIdentity): RateLimitConfig => {
      // Check for user override
      if (identity.userId && userOverrides[identity.userId]) {
        return userOverrides[identity.userId];
      }

      // Get limit by role
      if (identity.role && rateLimitByRole[identity.role as keyof typeof rateLimitByRole]) {
        return rateLimitByRole[identity.role as keyof typeof rateLimitByRole];
      }

      // Default rate limit
      return defaultRateLimit;
    },
    
    setUserRateLimit: (userId: string, config: RateLimitConfig): Effect.Effect<void> => {
      return Effect.sync(() => {
        userOverrides[userId] = config;
      });
    }
  }
); 