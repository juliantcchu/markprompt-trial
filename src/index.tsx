import { serve } from "bun";
import index from "./index.html";
import { Effect } from 'effect';
import { connectRedis, closeRedis } from './ratelimiter/redis';
import { rateLimitMiddleware, applyRateLimitHeaders } from './middleware/rateLimitMiddleware';
import { handleAdminRateLimitOverride } from './routes/admin';
import { getStatsHandler, updateStats } from './routes/stats';

// Initialize Redis connection
Effect.runPromise(connectRedis).catch(err => {
  console.error('Redis connection error:', err);
  console.log('Falling back to in-memory rate limiting');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await Effect.runPromise(closeRedis);
  process.exit(0);
});

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        // Apply rate limiting
        const { rateLimit, identity } = await rateLimitMiddleware(req);
        
        // Update stats
        updateStats(!rateLimit.isAllowed, '/api/hello', identity.userId);
        
        // If rate limit exceeded, return 429
        if (!rateLimit.isAllowed) {
          const response = new Response(JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
          }), { 
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
          
          return applyRateLimitHeaders(response, rateLimit);
        }
        
        // Normal response
        const response = new Response(JSON.stringify({
          message: "Hello, world!",
          method: "GET",
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
        return applyRateLimitHeaders(response, rateLimit);
      },
      async PUT(req) {
        // Apply rate limiting
        const { rateLimit, identity } = await rateLimitMiddleware(req);
        
        // Update stats
        updateStats(!rateLimit.isAllowed, '/api/hello', identity.userId);
        
        // If rate limit exceeded, return 429
        if (!rateLimit.isAllowed) {
          const response = new Response(JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
          }), { 
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
          
          return applyRateLimitHeaders(response, rateLimit);
        }
        
        // Normal response
        const response = new Response(JSON.stringify({
          message: "Hello, world!",
          method: "PUT",
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
        return applyRateLimitHeaders(response, rateLimit);
      },
    },

    "/api/hello/:name": async (req) => {
      // Apply rate limiting
      const { rateLimit, identity } = await rateLimitMiddleware(req);
      
      // Update stats
      updateStats(!rateLimit.isAllowed, '/api/hello/:name', identity.userId);
      
      // If rate limit exceeded, return 429
      if (!rateLimit.isAllowed) {
        const response = new Response(JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
        }), { 
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
        
        return applyRateLimitHeaders(response, rateLimit);
      }
      
      const name = req.params.name;
      const response = new Response(JSON.stringify({
        message: `Hello, ${name}!`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
      return applyRateLimitHeaders(response, rateLimit);
    },
    
    // Admin API to override rate limits
    "/api/admin/rate-limits": {
      async POST(req) {
        return handleAdminRateLimitOverride(req);
      }
    },
    
    // Stats API
    "/api/rate-limit-stats": {
      async GET(req) {
        return getStatsHandler(req);
      }
    }
  },

  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
