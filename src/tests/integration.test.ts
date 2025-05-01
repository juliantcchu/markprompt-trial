import { test, expect, mock } from "bun:test";
import { Effect, Layer } from "effect";
import { 
  rateLimitMiddleware, 
  applyRateLimitHeaders,
  RateLimitLive,
  RateLimitInMemoryLive
} from "../middleware/rateLimitMiddleware";
import { checkRateLimit } from "../ratelimiter/rateLimiter";
import { RateLimitConfigLive } from "../config/ratelimit";

// Integration tests for the rate limiting system
test("Integration - Rate limiting with multiple requests", async () => {
  // Create a sequence of requests from the same IP
  const createRequest = (path: string = "/api/test") => {
    return new Request(`https://example.com${path}`);
  };
  
  // Make multiple requests and check if rate limiting is applied
  const results = [];
  
  // Using in-memory storage to avoid Redis dependency
  for (let i = 0; i < 15; i++) {
    const req = createRequest();
    const middlewareEffect = rateLimitMiddleware(req);
    const result = await Effect.runPromise(
      Effect.provide(middlewareEffect, RateLimitInMemoryLive)
    );
    
    results.push({
      isAllowed: result.rateLimit.isAllowed,
      remaining: result.rateLimit.remaining
    });
  }
  
  // Check that the first 10 requests are allowed (with default limits)
  for (let i = 0; i < 10; i++) {
    expect(results[i].isAllowed).toBe(true);
    expect(results[i].remaining).toBe(10 - i - 1);
  }
  
  // Check that requests after limit are blocked
  for (let i = 10; i < 15; i++) {
    expect(results[i].isAllowed).toBe(false);
    expect(results[i].remaining).toBe(0);
  }
});

test("Integration - Different paths don't share rate limits", async () => {
  // Create requests to different paths
  const req1 = new Request("https://example.com/api/path1");
  const req2 = new Request("https://example.com/api/path2");
  
  // Make multiple requests to each path
  const path1Results = [];
  const path2Results = [];
  
  // Make 6 requests to each path
  for (let i = 0; i < 6; i++) {
    // Path 1
    const middleware1Effect = rateLimitMiddleware(req1);
    const result1 = await Effect.runPromise(
      Effect.provide(middleware1Effect, RateLimitInMemoryLive)
    );
    path1Results.push(result1.rateLimit);
    
    // Path 2
    const middleware2Effect = rateLimitMiddleware(req2);
    const result2 = await Effect.runPromise(
      Effect.provide(middleware2Effect, RateLimitInMemoryLive)
    );
    path2Results.push(result2.rateLimit);
  }
  
  // First 5 requests to each path should be allowed (default limit)
  for (let i = 0; i < 5; i++) {
    expect(path1Results[i].isAllowed).toBe(true);
    expect(path2Results[i].isAllowed).toBe(true);
  }
  
  // 6th request should be rate limited
  expect(path1Results[5].isAllowed).toBe(false);
  expect(path2Results[5].isAllowed).toBe(false);
  
  // Remaining counts should be independent for each path
  expect(path1Results[0].remaining).toBe(4); // 5-1
  expect(path2Results[0].remaining).toBe(4); // 5-1
});

test("Integration - Different users have different rate limits", async () => {
  // Create requests for different user types
  const anonymousReq = new Request("https://example.com/api/test");
  
  const freeUserReq = new Request("https://example.com/api/test", {
    headers: { "authorization": "Bearer test-free-user" }
  });
  
  const premiumUserReq = new Request("https://example.com/api/test", {
    headers: { "authorization": "Bearer test-premium-user" }
  });
  
  // Get rate limit results for each user type
  const anonymousEffect = rateLimitMiddleware(anonymousReq);
  const freeUserEffect = rateLimitMiddleware(freeUserReq);
  const premiumUserEffect = rateLimitMiddleware(premiumUserReq);
  
  const anonymousResult = await Effect.runPromise(
    Effect.provide(anonymousEffect, RateLimitInMemoryLive)
  );
  
  const freeUserResult = await Effect.runPromise(
    Effect.provide(freeUserEffect, RateLimitInMemoryLive)
  );
  
  const premiumUserResult = await Effect.runPromise(
    Effect.provide(premiumUserEffect, RateLimitInMemoryLive)
  );
  
  // Each user type should have different rate limits
  // Anonymous: 5 (default)
  // Free: 10 (from config)
  // Premium: 50 (from config)
  
  // Check limits by looking at remaining after 1 request
  expect(anonymousResult.rateLimit.remaining).toBe(4); // 5-1
  expect(freeUserResult.rateLimit.remaining).toBe(9);  // 10-1
  expect(premiumUserResult.rateLimit.remaining).toBe(49); // 50-1
}); 