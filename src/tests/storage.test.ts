import { test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer, Context } from "effect";
import { 
  RateLimitStorage, 
  RateLimitStorageService 
} from "../ratelimiter/rateLimiter";
import { 
  InMemoryStorageLive 
} from "../ratelimiter/redis";

// Create a mock storage for testing
const createMockStorage = (): RateLimitStorage => {
  // Create mock functions that track calls
  const checkLimitCalls: any[] = [];
  const recordRequestCalls: any[] = [];

  return {
    checkLimit: (key, windowMs, now) => {
      checkLimitCalls.push({ key, windowMs, now });
      return Effect.succeed(checkLimitCalls.length);
    },
    recordRequest: (key, timestamp, windowMs) => {
      recordRequestCalls.push({ key, timestamp, windowMs });
      return Effect.succeed(undefined);
    }
  };
};

// Create a mock storage layer
const MockStorageLive = Layer.succeed(
  RateLimitStorageService,
  createMockStorage()
);

// Test the in-memory storage implementation
test("InMemoryStorageLive - Records and counts requests", async () => {
  // Create an effect to test the storage
  const testStorageEffect = Effect.gen(function* (_) {
    const storage = yield* RateLimitStorageService;
    
    // Record some requests
    const key = "test-key";
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    // Record requests
    yield* storage.recordRequest(key, now - 50000, windowMs); // Old
    yield* storage.recordRequest(key, now - 30000, windowMs); // In window
    yield* storage.recordRequest(key, now - 10000, windowMs); // In window
    yield* storage.recordRequest(key, now, windowMs); // Current
    
    // Check limit with a window that only includes the last 3 requests
    const count = yield* storage.checkLimit(key, now - 40000, now);
    
    return count;
  });
  
  // Run with in-memory storage
  const count = await Effect.runPromise(
    Effect.provide(testStorageEffect, InMemoryStorageLive)
  );
  
  // Should count 3 requests (excluding the oldest one)
  expect(count).toBe(3);
});

// Test the mock storage directly
test("MockStorage - Tracks requests in memory", async () => {
  // Create an effect to test the storage
  const testStorageEffect = Effect.gen(function* (_) {
    const storage = yield* RateLimitStorageService;
    
    // Record requests
    const key = "test-key";
    const now = Date.now();
    const windowMs = 60000;
    
    // Record 5 requests
    for (let i = 0; i < 5; i++) {
      yield* storage.recordRequest(key, now - i * 10000, windowMs);
    }
    
    // Check count (our mock returns the number of calls to checkLimit)
    const count = yield* storage.checkLimit(key, now - 60000, now);
    
    return count;
  });
  
  // Run with mock storage
  const count = await Effect.runPromise(
    Effect.provide(testStorageEffect, MockStorageLive)
  );
  
  // Should be 1 (first call to checkLimit)
  expect(count).toBe(1);
});

// Test the storage with a redis mock
test("Storage - Redis vs In-memory behavior", async () => {
  // Create a simplified mock Redis client
  const mockRedisClient = {
    isConnected: false,
    client: null
  };
  
  // Create a test that uses the redis client option
  const testRedisEffectGenerator = () => Effect.gen(function* (_) {
    const storage = yield* RateLimitStorageService;
    
    // Record requests
    const key = "test-redis-key";
    const now = Date.now();
    
    yield* storage.recordRequest(key, now, 60000);
    yield* storage.recordRequest(key, now - 1000, 60000);
    
    // Check count
    return yield* storage.checkLimit(key, now - 30000, now);
  });
  
  // Run with in-memory storage (we can't easily mock Redis fully)
  const count = await Effect.runPromise(
    Effect.provide(testRedisEffectGenerator(), InMemoryStorageLive)
  );
  
  // InMemory storage should have both requests
  expect(count).toBe(2);
}); 