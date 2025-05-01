import { redisClient, inMemoryStore } from '../ratelimiter/redis';

// Rate limit statistics
let globalStats = {
  totalRequests: 0,
  limitedRequests: 0,
  requestsByEndpoint: {} as Record<string, number>,
  limitedByEndpoint: {} as Record<string, number>,
  requestsByUser: {} as Record<string, number>,
  limitedByUser: {} as Record<string, number>
};

// Update stats when a request is processed
export const updateStats = (
  isLimited: boolean, 
  endpoint: string, 
  userId: string | undefined
) => {
  globalStats.totalRequests++;
  
  if (isLimited) {
    globalStats.limitedRequests++;
  }
  
  // Update endpoint stats
  if (!globalStats.requestsByEndpoint[endpoint]) {
    globalStats.requestsByEndpoint[endpoint] = 0;
  }
  globalStats.requestsByEndpoint[endpoint]++;
  
  if (isLimited) {
    if (!globalStats.limitedByEndpoint[endpoint]) {
      globalStats.limitedByEndpoint[endpoint] = 0;
    }
    globalStats.limitedByEndpoint[endpoint]++;
  }
  
  // Update user stats if user is identified
  if (userId) {
    if (!globalStats.requestsByUser[userId]) {
      globalStats.requestsByUser[userId] = 0;
    }
    globalStats.requestsByUser[userId]++;
    
    if (isLimited) {
      if (!globalStats.limitedByUser[userId]) {
        globalStats.limitedByUser[userId] = 0;
      }
      globalStats.limitedByUser[userId]++;
    }
  }
};

// Get detailed stats about rate limiting
export const getStatsHandler = async (req: Request) => {
  try {
    // Get additional Redis metrics if available
    const redisMetrics = await getRedisMetrics();
    
    const stats = {
      ...globalStats,
      limitRatio: globalStats.totalRequests > 0 
        ? (globalStats.limitedRequests / globalStats.totalRequests).toFixed(4) 
        : '0',
      activeKeys: redisMetrics.activeKeys,
      totalKeys: redisMetrics.totalKeys,
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Stats error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Get Redis metrics (or in-memory metrics if Redis is not available)
const getRedisMetrics = async () => {
  try {
    if (redisClient.isOpen) {
      // Get all rate limit keys
      const keys = await redisClient.keys('ratelimit:*');
      
      // Count active keys (those with at least one request in the current window)
      let activeKeys = 0;
      for (const key of keys) {
        const count = await redisClient.zCard(key);
        if (count > 0) {
          activeKeys++;
        }
      }
      
      return {
        activeKeys,
        totalKeys: keys.length
      };
    } else {
      // In-memory metrics
      return {
        activeKeys: Object.keys(inMemoryStore).filter(key => 
          Object.keys(inMemoryStore[key]).length > 0
        ).length,
        totalKeys: Object.keys(inMemoryStore).length
      };
    }
  } catch (error) {
    console.error('Error getting Redis metrics:', error);
    return {
      activeKeys: 0,
      totalKeys: 0
    };
  }
}; 