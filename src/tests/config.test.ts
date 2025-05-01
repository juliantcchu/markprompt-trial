import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Effect, Layer } from "effect";
import { 
  RateLimitConfigProvider, 
  RateLimitConfigLive, 
  rateLimitByRole,
  userOverrides,
  defaultRateLimit,
  RateLimitConfig
} from "../config/ratelimit";
import { UserIdentity } from "../ratelimiter/rateLimiter";

// Reset user overrides before each test
beforeEach(() => {
  // Clear the userOverrides object
  Object.keys(userOverrides).forEach(key => {
    delete userOverrides[key];
  });
});

// Test suite for the rate limit config service
test("RateLimitConfigProvider - Default rate limit for unknown user", async () => {
  // Create a test identity with no user ID or role
  const identity: UserIdentity = {
    ip: "127.0.0.1"
  };

  // Create an effect that gets the config from the service
  const getConfigEffect = Effect.gen(function* (_) {
    const configService = yield* RateLimitConfigProvider;
    return configService.getRateLimitConfig(identity);
  });

  // Run the effect with the config layer
  const config = await Effect.runPromise(
    Effect.provide(getConfigEffect, RateLimitConfigLive)
  );

  // Assert the default config is returned
  expect(config).toEqual(defaultRateLimit);
});

test("RateLimitConfigProvider - Returns config by role", async () => {
  // Create test identities for different roles
  const freeUser: UserIdentity = {
    userId: "free-user",
    role: "free",
    ip: "127.0.0.1"
  };

  const premiumUser: UserIdentity = {
    userId: "premium-user",
    role: "premium",
    ip: "127.0.0.1"
  };

  // Create effects to get configs
  const getFreeConfigEffect = Effect.gen(function* (_) {
    const configService = yield* RateLimitConfigProvider;
    return configService.getRateLimitConfig(freeUser);
  });

  const getPremiumConfigEffect = Effect.gen(function* (_) {
    const configService = yield* RateLimitConfigProvider;
    return configService.getRateLimitConfig(premiumUser);
  });

  // Run the effects
  const freeConfig = await Effect.runPromise(
    Effect.provide(getFreeConfigEffect, RateLimitConfigLive)
  );

  const premiumConfig = await Effect.runPromise(
    Effect.provide(getPremiumConfigEffect, RateLimitConfigLive)
  );

  // Assert the correct configs are returned
  expect(freeConfig).toEqual(rateLimitByRole.free);
  expect(premiumConfig).toEqual(rateLimitByRole.premium);
});

test("RateLimitConfigProvider - User override takes precedence", async () => {
  // Create a custom rate limit
  const customLimit: RateLimitConfig = {
    maxRequests: 42,
    windowMs: 30 * 1000 // 30 seconds
  };

  // Create a test identity
  const identity: UserIdentity = {
    userId: "custom-user",
    role: "free", // This would normally get free tier limits
    ip: "127.0.0.1"
  };

  // Set the override using the service
  const setOverrideEffect = Effect.gen(function* (_) {
    const configService = yield* RateLimitConfigProvider;
    yield* configService.setUserRateLimit(identity.userId!, customLimit);
  });

  // Get the config for the user
  const getConfigEffect = Effect.gen(function* (_) {
    const configService = yield* RateLimitConfigProvider;
    return configService.getRateLimitConfig(identity);
  });

  // Set the override and get the config
  await Effect.runPromise(
    Effect.provide(setOverrideEffect, RateLimitConfigLive)
  );

  const config = await Effect.runPromise(
    Effect.provide(getConfigEffect, RateLimitConfigLive)
  );

  // Assert the override is applied
  expect(config).toEqual(customLimit);
  expect(config).not.toEqual(rateLimitByRole.free);
}); 