import { serve } from "bun";
import index from "./index.html";
import { Effect } from 'effect';
import { 
  rateLimitMiddleware, 
  applyRateLimitHeaders, 
  getRateLimitLayer,
  RateLimitLive,
  RateLimitTokenBucketLive,
  RateLimitLeakyBucketLive,
  RateLimitFixedWindowLive 
} from './middleware/rateLimitMiddleware';
import { handleAdminRateLimitOverride } from './routes/admin';
import { getStatsHandler, updateStats } from './routes/stats';

// Get rate limiting strategy from env vars
const getRateLimitingStrategy = () => {
  const strategy = process.env.RATE_LIMIT_STRATEGY || 'sliding-window';
  const useRedis = process.env.USE_REDIS !== 'false';
  
  console.log(`Using rate limiting strategy: ${strategy}, storage: ${useRedis ? 'Redis' : 'In-Memory'}`);
  
  return getRateLimitLayer(
    strategy as any, // Type cast to satisfy TypeScript
    useRedis
  );
};

// Default rate limit layer
const defaultRateLimitLayer = getRateLimitingStrategy();

// No need to manually initialize Redis - it's handled by the Layer system

// Graceful shutdown - Redis client is managed by the Layer system
process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        try {
          // Apply rate limiting with dependency injection
          const rateLimitEffect = rateLimitMiddleware(req);
          const { rateLimit, identity } = await Effect.runPromise(
            Effect.provide(rateLimitEffect, defaultRateLimitLayer)
          );
          
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
        } catch (error) {
          console.error('Route handler error:', error);
          return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      },
      async PUT(req) {
        try {
          // Apply rate limiting with dependency injection
          const rateLimitEffect = rateLimitMiddleware(req);
          const { rateLimit, identity } = await Effect.runPromise(
            Effect.provide(rateLimitEffect, defaultRateLimitLayer)
          );
          
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
        } catch (error) {
          console.error('Route handler error:', error);
          return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      },
    },

    "/api/hello/:name": async (req) => {
      try {
        // Apply rate limiting with dependency injection
        const rateLimitEffect = rateLimitMiddleware(req);
        const { rateLimit, identity } = await Effect.runPromise(
          Effect.provide(rateLimitEffect, defaultRateLimitLayer)
        );
        
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
      } catch (error) {
        console.error('Route handler error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Demo endpoints for different rate limiting strategies
    "/api/demo/token-bucket": async (req) => {
      try {
        // Apply TOKEN BUCKET rate limiting
        const rateLimitEffect = rateLimitMiddleware(req);
        const { rateLimit, identity } = await Effect.runPromise(
          Effect.provide(rateLimitEffect, RateLimitTokenBucketLive)
        );
        
        // Update stats
        updateStats(!rateLimit.isAllowed, '/api/demo/token-bucket', identity.userId);
        
        // If rate limit exceeded, return 429
        if (!rateLimit.isAllowed) {
          const response = new Response(JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded using Token Bucket algorithm',
          }), { 
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
          
          return applyRateLimitHeaders(response, rateLimit);
        }
        
        // Normal response
        const response = new Response(JSON.stringify({
          message: "This endpoint uses Token Bucket rate limiting",
          tokens_remaining: rateLimit.remaining,
          reset_at: new Date(rateLimit.resetTime).toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
        return applyRateLimitHeaders(response, rateLimit);
      } catch (error) {
        console.error('Route handler error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    "/api/demo/leaky-bucket": async (req) => {
      try {
        // Apply LEAKY BUCKET rate limiting
        const rateLimitEffect = rateLimitMiddleware(req);
        const { rateLimit, identity } = await Effect.runPromise(
          Effect.provide(rateLimitEffect, RateLimitLeakyBucketLive)
        );
        
        // Update stats
        updateStats(!rateLimit.isAllowed, '/api/demo/leaky-bucket', identity.userId);
        
        // If rate limit exceeded, return 429
        if (!rateLimit.isAllowed) {
          const response = new Response(JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded using Leaky Bucket algorithm',
          }), { 
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
          
          return applyRateLimitHeaders(response, rateLimit);
        }
        
        // Normal response
        const response = new Response(JSON.stringify({
          message: "This endpoint uses Leaky Bucket rate limiting",
          capacity_remaining: rateLimit.remaining,
          retry_after: new Date(rateLimit.resetTime).toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
        return applyRateLimitHeaders(response, rateLimit);
      } catch (error) {
        console.error('Route handler error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    "/api/demo/fixed-window": async (req) => {
      try {
        // Apply FIXED WINDOW rate limiting
        const rateLimitEffect = rateLimitMiddleware(req);
        const { rateLimit, identity } = await Effect.runPromise(
          Effect.provide(rateLimitEffect, RateLimitFixedWindowLive)
        );
        
        // Update stats
        updateStats(!rateLimit.isAllowed, '/api/demo/fixed-window', identity.userId);
        
        // If rate limit exceeded, return 429
        if (!rateLimit.isAllowed) {
          const response = new Response(JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded using Fixed Window algorithm',
          }), { 
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
          
          return applyRateLimitHeaders(response, rateLimit);
        }
        
        // Normal response
        const response = new Response(JSON.stringify({
          message: "This endpoint uses Fixed Window rate limiting",
          requests_remaining: rateLimit.remaining,
          window_resets_at: new Date(rateLimit.resetTime).toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
        return applyRateLimitHeaders(response, rateLimit);
      } catch (error) {
        console.error('Route handler error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Rate limit information endpoint
    "/api/rate-limit-info": async (req) => {
      return new Response(JSON.stringify({
        active_strategy: process.env.RATE_LIMIT_STRATEGY || 'sliding-window',
        storage: process.env.USE_REDIS !== 'false' ? 'redis' : 'in-memory',
        demo_endpoints: [
          '/api/demo/token-bucket',
          '/api/demo/leaky-bucket',
          '/api/demo/fixed-window'
        ],
        available_strategies: [
          'sliding-window', 
          'fixed-window',
          'token-bucket',
          'leaky-bucket'
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
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
console.log(`Rate limiting: strategy=${process.env.RATE_LIMIT_STRATEGY || 'sliding-window'}, storage=${process.env.USE_REDIS !== 'false' ? 'Redis' : 'In-Memory'}`);
