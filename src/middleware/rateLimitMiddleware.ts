import { Effect } from 'effect';
import { UserIdentity, RateLimitResult, checkRateLimit, getRateLimitConfig } from '../ratelimiter/rateLimiter';

// Extract bearer token from authorization header
const extractBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

// Mock function to get user from token - in a real app, this would validate the token
// and fetch user info from a database
const getUserFromToken = (token: string): { id: string, role: string } | null => {
  // Mock implementation - replace with actual authentication logic
  if (token === 'test-free-user') {
    return { id: 'user-1', role: 'free' };
  } else if (token === 'test-premium-user') {
    return { id: 'user-2', role: 'premium' };
  } else if (token === 'test-admin-user') {
    return { id: 'admin-1', role: 'admin' };
  }
  return null;
};

// Rate limit middleware
export const rateLimitMiddleware = async (req: Request): Promise<{ 
  rateLimit: RateLimitResult, 
  identity: UserIdentity 
}> => {
  // Get client IP
  const ip = req.headers.get('x-forwarded-for') || 
             req.headers.get('cf-connecting-ip') || 
             'unknown-ip';

  // Get authorization header
  const authHeader = req.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  
  // Get user info if token exists
  const user = token ? getUserFromToken(token) : null;
  
  // Create user identity
  const identity: UserIdentity = {
    userId: user?.id,
    role: user?.role,
    ip: ip as string
  };
  
  // Get rate limit configuration for this user
  const config = getRateLimitConfig(identity);
  
  // Create key for rate limiting (combine user ID or IP with path)
  const path = new URL(req.url).pathname;
  const rateLimitKey = `ratelimit:${identity.userId || ip}:${path}`;
  
  // Check rate limit
  const rateLimitEffect = checkRateLimit(rateLimitKey, config);
  const rateLimit = await Effect.runPromise(rateLimitEffect);
  
  return { rateLimit, identity };
};

// Apply rate limit headers to response
export const applyRateLimitHeaders = (
  response: Response, 
  rateLimit: RateLimitResult
): Response => {
  const remainingSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
  
  response.headers.set('X-RateLimit-Limit', rateLimit.remaining + (rateLimit.isAllowed ? 1 : 0) + '');
  response.headers.set('X-RateLimit-Remaining', rateLimit.remaining + '');
  response.headers.set('X-RateLimit-Reset', Math.floor(rateLimit.resetTime / 1000) + '');
  
  if (!rateLimit.isAllowed) {
    response.headers.set('Retry-After', remainingSeconds + '');
  }
  
  return response;
}; 