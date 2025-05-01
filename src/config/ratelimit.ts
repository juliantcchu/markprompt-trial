// Rate limit configuration
export type UserRole = 'free' | 'premium' | 'admin';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
}

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

// User overrides - can be modified by admin API
export const userOverrides: Record<string, RateLimitConfig> = {}; 