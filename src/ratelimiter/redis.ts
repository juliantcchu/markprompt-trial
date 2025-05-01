import { createClient } from 'redis';
import { Effect, Context, Layer, Option } from 'effect';
import { RateLimitStorage, RateLimitStorageService } from './rateLimiter';

// Redis client interface
export interface RedisClientService {
  client: any; // Using any to avoid type conflicts with redis client
  isConnected: boolean;
}

// Redis client service tag
export class RedisClient extends Context.Tag("RedisClient")<
  RedisClient,
  RedisClientService
>() {}

// In-memory fallback storage (for development or if Redis is unavailable)
const inMemoryStore: Record<string, Record<string, number>> = {};
// For storing state data (used by token bucket and leaky bucket algorithms)
const inMemoryStateStore: Record<string, string> = {};
const inMemoryStateTTL: Record<string, number> = {};

// Redis implementation for rate limit storage
const createRedisStorage = (redisService: RedisClientService): RateLimitStorage => ({
  checkLimit: (key: string, windowStart: number, now: number): Effect.Effect<number> => {
    if (redisService.isConnected) {
      return Effect.tryPromise({
        try: async () => {
          // Remove counts older than the window
          await redisService.client.zRemRangeByScore(key, 0, windowStart);
          
          // Count requests in the current window
          return await redisService.client.zCard(key);
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error))
      }).pipe(
        Effect.catchAll(error => {
          console.error('Redis check limit error:', error);
          return Effect.succeed(0);
        })
      );
    } else {
      // Fallback to in-memory storage
      return Effect.sync(() => {
        // Clean old timestamps
        if (!inMemoryStore[key]) {
          return 0;
        }
        
        const timestamps = Object.keys(inMemoryStore[key])
          .map(Number)
          .filter(timestamp => timestamp > windowStart);
          
        return timestamps.length;
      });
    }
  },
  
  recordRequest: (key: string, timestamp: number, windowMs: number): Effect.Effect<void> => {
    if (redisService.isConnected) {
      return Effect.tryPromise({
        try: async () => {
          // Add current request timestamp to sorted set
          await redisService.client.zAdd(key, { score: timestamp, value: timestamp.toString() });
          
          // Set expiry on the key
          await redisService.client.expire(key, Math.ceil(windowMs / 1000));
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error))
      }).pipe(
        Effect.catchAll(error => {
          console.error('Redis record request error:', error);
          return Effect.succeed(undefined);
        })
      );
    } else {
      // Fallback to in-memory storage
      return Effect.sync(() => {
        // Initialize if not exists
        if (!inMemoryStore[key]) {
          inMemoryStore[key] = {};
        }
        
        // Add current request
        inMemoryStore[key][timestamp] = 1;
      });
    }
  },

  // Get state data (for token bucket and leaky bucket)
  getState: (key: string): Effect.Effect<string | null> => {
    if (redisService.isConnected) {
      return Effect.tryPromise({
        try: async () => {
          return await redisService.client.get(key);
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error))
      }).pipe(
        Effect.catchAll(error => {
          console.error('Redis get state error:', error);
          return Effect.succeed(null);
        })
      );
    } else {
      // Fallback to in-memory storage
      return Effect.sync(() => {
        // Check if TTL has expired
        const expiryTime = inMemoryStateTTL[key] || 0;
        if (expiryTime < Date.now()) {
          delete inMemoryStateStore[key];
          delete inMemoryStateTTL[key];
          return null;
        }
        return inMemoryStateStore[key] || null;
      });
    }
  },
  
  // Set state data (for token bucket and leaky bucket)
  setState: (key: string, value: string, ttlSeconds: number): Effect.Effect<void> => {
    if (redisService.isConnected) {
      return Effect.tryPromise({
        try: async () => {
          await redisService.client.set(key, value, { EX: ttlSeconds });
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error))
      }).pipe(
        Effect.catchAll(error => {
          console.error('Redis set state error:', error);
          return Effect.succeed(undefined);
        })
      );
    } else {
      // Fallback to in-memory storage
      return Effect.sync(() => {
        inMemoryStateStore[key] = value;
        inMemoryStateTTL[key] = Date.now() + (ttlSeconds * 1000);
      });
    }
  }
});

// Create Redis client layer
export const RedisClientLive = Layer.succeed(
  RedisClient,
  Effect.runSync(Effect.gen(function* (_) {
    const client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    
    let isConnected = false;
    
    // Try to connect (handled outside the layer to avoid issues with Layer.effect)
    try {
      client.connect().catch(err => {
        console.error('Redis connection error:', err);
      });
      
      // Add event listeners
      client.on('connect', () => {
        console.log('Connected to Redis');
        isConnected = true;
      });
      
      client.on('error', err => {
        console.error('Redis client error:', err);
        isConnected = false;
      });
    } catch (err) {
      console.error('Redis setup error:', err);
    }
    
    return {
      client,
      isConnected
    };
  }))
);

// Create Redis storage layer based on Redis client
export const RedisStorageLive = Layer.effect(
  RateLimitStorageService,
  Effect.gen(function* (_) {
    const redis = yield* Effect.serviceOption(RedisClient);
    
    // Create storage with Redis if available, otherwise use in-memory
    return createRedisStorage({
      client: Option.isNone(redis) ? null : redis.value.client,
      isConnected: Option.isNone(redis) ? false : redis.value.isConnected
    });
  })
);

// In-memory only storage layer
export const InMemoryStorageLive = Layer.succeed(
  RateLimitStorageService,
  createRedisStorage({ client: null, isConnected: false })
); 