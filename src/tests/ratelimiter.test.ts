import { test, expect, mock } from "bun:test";
import { Effect, Layer } from "effect";
import { 
  checkRateLimit, 
  RateLimitResult,
  RateLimitStorageService
} from "../ratelimiter/rateLimiter";
import { RateLimitConfig } from "../config/ratelimit";

// Create a mock storage with controllable return values
const createTestStorage = (requestCount: number) => ({
  checkLimit: () => Effect.succeed(requestCount),
  recordRequest: () => Effect.succeed(undefined)
});

// Create different storage layers for different test scenarios
const createTestStorageLayer = (requestCount: number) => Layer.succeed(
  RateLimitStorageService,
  createTestStorage(requestCount)
);

// Test scenarios for rate limiting
test("checkRateLimit - Allows requests under the limit", async () => {
  // Create a test config
  const config: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60000 // 1 minute
  };
  
  // Create storage that returns 5 existing requests
  const UnderLimitStorage = createTestStorageLayer(5);
  
  // Create the rate limit check effect
  const checkEffect = checkRateLimit("test-key", config);
  
  // Run the effect with test storage
  const result = await Effect.runPromise(
    Effect.provide(checkEffect, UnderLimitStorage)
  );
  
  // Verify it allows the request
  expect(result.isAllowed).toBe(true);
  expect(result.remaining).toBe(5); // 10 max - 5 used
});

test("checkRateLimit - Blocks requests at the limit", async () => {
  // Create a test config
  const config: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60000 // 1 minute
  };
  
  // Create storage that returns 10 existing requests (at limit)
  const AtLimitStorage = createTestStorageLayer(10);
  
  // Create the rate limit check effect
  const checkEffect = checkRateLimit("test-key", config);
  
  // Run the effect with test storage
  const result = await Effect.runPromise(
    Effect.provide(checkEffect, AtLimitStorage)
  );
  
  // Verify it allows the request (10 = 10)
  expect(result.isAllowed).toBe(true);
  expect(result.remaining).toBe(0); // 10 max - 10 used
});

test("checkRateLimit - Blocks requests over the limit", async () => {
  // Create a test config
  const config: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60000 // 1 minute
  };
  
  // Create storage that returns 11 existing requests (over limit)
  const OverLimitStorage = createTestStorageLayer(11);
  
  // Create the rate limit check effect
  const checkEffect = checkRateLimit("test-key", config);
  
  // Run the effect with test storage
  const result = await Effect.runPromise(
    Effect.provide(checkEffect, OverLimitStorage)
  );
  
  // Verify it blocks the request
  expect(result.isAllowed).toBe(false);
  expect(result.remaining).toBe(0); // 0 remaining (over limit)
});

test("checkRateLimit - Handles storage errors gracefully", async () => {
  // Create a test config
  const config: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60000
  };
  
    // Create a storage that throws an error
    const ErrorStorage = Layer.succeed(
    RateLimitStorageService,
    {
      checkLimit: () => Effect.failSync(() => new Error("Storage error")) as unknown as Effect.Effect<number, never, never>,
      recordRequest: () => Effect.failSync(() => new Error("Storage error")) as unknown as Effect.Effect<void, never, never>
    }
  );
  
  // Create the rate limit check effect
  const checkEffect = checkRateLimit("test-key", config);
  
  // Run the effect with error storage
  const result = await Effect.runPromise(
    Effect.provide(checkEffect, ErrorStorage)
  );
  
  // Should fail open (allow request on error)
  expect(result.isAllowed).toBe(true);
}); 