import { createClient } from 'redis';
import { Effect } from 'effect';

// Redis client
export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

// Connect to Redis
export const connectRedis = Effect.tryPromise({
  try: async () => {
    await redisClient.connect();
    console.log('Connected to Redis');
    return redisClient;
  },
  catch: (error) => {
    console.error('Error connecting to Redis:', error);
    // Fallback to in-memory storage if Redis is not available
    return null;
  }
});

// In-memory fallback storage (for development or if Redis is unavailable)
export const inMemoryStore: Record<string, Record<string, number>> = {};

// Close Redis connection
export const closeRedis = Effect.tryPromise({
  try: async () => {
    if (redisClient.isOpen) {
      await redisClient.disconnect();
      console.log('Disconnected from Redis');
    }
    return true;
  },
  catch: (error) => {
    console.error('Error disconnecting from Redis:', error);
    return false;
  }
}); 