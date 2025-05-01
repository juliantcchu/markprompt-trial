import { Effect } from 'effect';
import { rateLimitMiddleware, applyRateLimitHeaders, RateLimitLive } from '../middleware/rateLimitMiddleware';

// Example API route handler with rate limiting
export const handleApiRequest = async (req: Request): Promise<Response> => {
  try {
    // Use the rate limit middleware with dependency injection
    const rateLimitEffect = rateLimitMiddleware(req);
    
    // Run the effect with the rate limit live layer
    const { rateLimit, identity } = await Effect.runPromise(
      Effect.provide(rateLimitEffect, RateLimitLive)
    );
    
    // If rate limit exceeded, return 429 status
    if (!rateLimit.isAllowed) {
      const response = new Response(
        JSON.stringify({ 
          error: 'Too many requests', 
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000) 
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
      
      // Apply rate limit headers
      return applyRateLimitHeaders(response, rateLimit);
    }
    
    // Process the actual request
    // ...your API logic here...
    
    // Return successful response with rate limit headers
    const response = new Response(
      JSON.stringify({ 
        message: 'Success',
        user: identity.userId ? `User ID: ${identity.userId}` : 'Anonymous',
        role: identity.role || 'none'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
    return applyRateLimitHeaders(response, rateLimit);
    
  } catch (error) {
    console.error('API request error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}; 