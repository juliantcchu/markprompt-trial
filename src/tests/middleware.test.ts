import { test, expect, mock } from "bun:test";
import { Effect, Layer, Context } from "effect";
import { 
  rateLimitMiddleware, 
  applyRateLimitHeaders 
} from "../middleware/rateLimitMiddleware";
import { 
  RateLimitStorageService, 
  RateLimitResult
} from "../ratelimiter/rateLimiter";
import { 
  RateLimitConfigProvider, 
  RateLimitConfig 
} from "../config/ratelimit";

// Create a mock request
const createMockRequest = (path: string, headers: Record<string, string> = {}) => {
  return new Request(`https://example.com${path}`, {
    headers
  });
};

// Create a test storage layer
const TestStorageLive = Layer.succeed(
  RateLimitStorageService,
  {
    checkLimit: () => Effect.succeed(0),
    recordRequest: () => Effect.succeed(undefined)
  }
);

// Create a test config layer with predictable behavior
const TestConfigLive = Layer.succeed(
  RateLimitConfigProvider,
  {
    getRateLimitConfig: () => ({
      maxRequests: 10,
      windowMs: 60000
    }),
    setUserRateLimit: () => Effect.succeed(undefined)
  }
);

// Combined test layer
const TestRateLimitLive = Layer.merge(
  TestStorageLive,
  TestConfigLive
);

// Test the middleware
test("rateLimitMiddleware - Processes anonymous requests", async () => {
  // Create a mock request
  const req = createMockRequest("/api/test");
  
  // Run the middleware
  const middlewareEffect = rateLimitMiddleware(req);
  const result = await Effect.runPromise(
    Effect.provide(middlewareEffect, TestRateLimitLive)
  );
  
  // Check the result
  expect(result.identity.ip).toBe("unknown-ip");
  expect(result.identity.userId).toBeUndefined();
  expect(result.identity.role).toBeUndefined();
  expect(result.rateLimit.isAllowed).toBe(true);
});

test("rateLimitMiddleware - Extracts user info from auth header", async () => {
  // Create a mock request with auth header
  const req = createMockRequest("/api/test", {
    "authorization": "Bearer test-free-user"
  });
  
  // Run the middleware
  const middlewareEffect = rateLimitMiddleware(req);
  const result = await Effect.runPromise(
    Effect.provide(middlewareEffect, TestRateLimitLive)
  );
  
  // Check the result
  expect(result.identity.userId).toBe("user-1");
  expect(result.identity.role).toBe("free");
  expect(result.rateLimit.isAllowed).toBe(true);
});

test("rateLimitMiddleware - Creates different keys for different paths", async () => {
  // Create a spy to track keys
  const keysSeen: string[] = [];
  
  // Create a storage that tracks keys
  const KeyTrackingStorage = Layer.succeed(
    RateLimitStorageService,
    {
      checkLimit: (key) => {
        keysSeen.push(key as string);
        return Effect.succeed(0);
      },
      recordRequest: (key) => {
        return Effect.succeed(undefined);
      }
    }
  );
  
  // Create a test layer with key tracking
  const TestLayer = Layer.merge(
    KeyTrackingStorage,
    TestConfigLive
  );
  
  // Create two requests with different paths
  const req1 = createMockRequest("/api/path1");
  const req2 = createMockRequest("/api/path2");
  
  // Run the middleware for both requests
  await Effect.runPromise(
    Effect.provide(rateLimitMiddleware(req1), TestLayer)
  );
  
  await Effect.runPromise(
    Effect.provide(rateLimitMiddleware(req2), TestLayer)
  );
  
  // Check that different keys were used
  expect(keysSeen.length).toBe(2);
  expect(keysSeen[0]).not.toBe(keysSeen[1]);
});

test("applyRateLimitHeaders - Adds correct headers", () => {
  // Create a mock rate limit result
  const rateLimit: RateLimitResult = {
    isAllowed: true,
    remaining: 42,
    resetTime: Date.now() + 60000 // 1 minute in the future
  };
  
  // Create a response
  const response = new Response("OK", {
    status: 200
  });
  
  // Apply headers
  const resultResponse = applyRateLimitHeaders(response, rateLimit);
  
  // Check headers
  expect(resultResponse.headers.get("X-RateLimit-Limit")).toBe("43"); // remaining + 1
  expect(resultResponse.headers.get("X-RateLimit-Remaining")).toBe("42");
  expect(resultResponse.headers.get("X-RateLimit-Reset")).toBeTruthy();
  expect(resultResponse.headers.has("Retry-After")).toBe(false);
});

test("applyRateLimitHeaders - Adds Retry-After when rate limited", () => {
  // Create a mock rate limit result that indicates limit exceeded
  const rateLimit: RateLimitResult = {
    isAllowed: false,
    remaining: 0,
    resetTime: Date.now() + 60000 // 1 minute in the future
  };
  
  // Create a response
  const response = new Response("Rate limited", {
    status: 429
  });
  
  // Apply headers
  const resultResponse = applyRateLimitHeaders(response, rateLimit);
  
  // Check headers
  expect(resultResponse.headers.get("X-RateLimit-Remaining")).toBe("0");
  expect(resultResponse.headers.has("Retry-After")).toBe(true);
  
  // Retry-After should be close to 60 seconds (might be 59 due to processing time)
  const retryAfter = parseInt(resultResponse.headers.get("Retry-After") || "0");
  expect(retryAfter).toBeGreaterThan(50);
  expect(retryAfter).toBeLessThanOrEqual(60);
}); 