import { Effect } from 'effect';
import { redisClient, inMemoryStore } from './redis';
import { RateLimitConfig, defaultRateLimit, rateLimitByRole, userOverrides } from '../config/ratelimit';

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

// Get rate limit config for a user
export const getRateLimitConfig = (identity: UserIdentity): RateLimitConfig => {
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
};

// Check rate limit using Redis
export const checkRateLimit = (key: string, config: RateLimitConfig): Effect.Effect<RateLimitResult, Error> => {
  return Effect.tryPromise(() => 
    new Promise<RateLimitResult>(async (resolve, reject) => {
      try {
        const now = Date.now();
        const windowStart = now - config.windowMs;
        
        // Try to use Redis if available
        if (redisClient.isOpen) {
          // Remove counts older than the window
          await redisClient.zRemRangeByScore(key, 0, windowStart);
          
          // Add current request timestamp to sorted set
          await redisClient.zAdd(key, { score: now, value: now.toString() });
          
          // Set expiry on the key
          await redisClient.expire(key, Math.ceil(config.windowMs / 1000));
          
          // Count requests in the current window
          const requestCount = await redisClient.zCard(key);
          
          resolve({
            isAllowed: requestCount <= config.maxRequests,
            remaining: Math.max(0, config.maxRequests - requestCount),
            resetTime: now + config.windowMs
          });
        } 
        // Fallback to in-memory (for development or if Redis is unavailable)
        else {
          // Initialize if not exists
          if (!inMemoryStore[key]) {
            inMemoryStore[key] = {};
          }
          
          // Clean old timestamps
          const timestamps = Object.keys(inMemoryStore[key])
            .map(Number)
            .filter(timestamp => timestamp > windowStart);
          
          // Reset and add current timestamps
          inMemoryStore[key] = {};
          timestamps.forEach(timestamp => {
            inMemoryStore[key][timestamp] = 1;
          });
          
          // Add current request
          inMemoryStore[key][now] = 1;
          
          const requestCount = Object.keys(inMemoryStore[key]).length;
          
          resolve({
            isAllowed: requestCount <= config.maxRequests,
            remaining: Math.max(0, config.maxRequests - requestCount),
            resetTime: now + config.windowMs
          });
        }
      } catch (error) {
        console.error('Rate limit check error:', error);
        // On error, allow the request (fail open)
        resolve({
          isAllowed: true,
          remaining: 0,
          resetTime: Date.now() + defaultRateLimit.windowMs
        });
      }
    })
  );
};

// Set rate limit override for a specific user
export const setUserRateLimit = (userId: string, config: RateLimitConfig): void => {
  userOverrides[userId] = config;
}; 