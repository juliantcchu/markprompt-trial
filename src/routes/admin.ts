import { Effect } from 'effect';
import { setUserRateLimit } from '../ratelimiter/rateLimiter';
import { rateLimitByRole, RateLimitConfigLive, RateLimitConfigProvider } from '../config/ratelimit';

interface RateLimitOverrideRequest {
  userId: string;
  maxRequests: number;
  windowMs?: number;
}

// Admin endpoint to override rate limits for a specific user
export const handleAdminRateLimitOverride = async (req: Request) => {
  try {
    // Verify admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.substring(7);
    // Simple mock admin check - in a real app, use proper authentication
    if (token !== 'test-admin-user') {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin access required' }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Parse request body
    const data = await req.json() as RateLimitOverrideRequest;
    
    // Validate required fields
    if (!data.userId || typeof data.maxRequests !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid request - userId and maxRequests required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Set rate limit override using Effect
    const setRateLimitEffect = setUserRateLimit(data.userId, {
      maxRequests: data.maxRequests,
      windowMs: data.windowMs || rateLimitByRole.free.windowMs // Default to standard window
    });
    
    // Run the effect with the config layer
    await Effect.runPromise(
      Effect.provide(setRateLimitEffect, RateLimitConfigLive)
    );
    
    return new Response(JSON.stringify({ 
      success: true,
      message: `Rate limit for user ${data.userId} set to ${data.maxRequests} requests per ${(data.windowMs || rateLimitByRole.free.windowMs) / 1000} seconds`
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Admin API error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}; 