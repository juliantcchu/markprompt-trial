

P.S. test cases not updated


# Rate Limiter with Effect

A flexible rate limiter implementation for REST APIs using Effect and Redis.

## Features

- Client identification using bearer tokens
- Multiple rate limit tiers (free, premium, admin)
- Distributed rate limiting with Redis (with fallback to in-memory)
- Admin API to override rate limits
- Rate limit statistics and metrics
- Simple frontend for testing and demonstration

## Setup

### Prerequisites

- [Bun](https://bun.sh/) installed
- Redis server (optional, falls back to in-memory if not available)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd rate-limiter

# Install dependencies
bun install
```

### Environment Variables

Create a `.env` file in the root directory:

```
# Optional - defaults to redis://localhost:6379
REDIS_URL=redis://localhost:6379
```

### Running the Application

```bash
# Start the server
bun run src/index.tsx
```

Visit `http://localhost:3000` to access the demo UI.

## API Endpoints

### Standard Endpoints (Rate Limited)

- `GET /api/hello` - Simple hello endpoint
- `PUT /api/hello` - Same endpoint with PUT method
- `GET /api/hello/:name` - Hello with name parameter

### Admin Endpoints

- `POST /api/admin/rate-limits` - Override rate limits for a specific user

  Request body:
  ```json
  {
    "userId": "user-1",
    "maxRequests": 20,
    "windowMs": 60000
  }
  ```

### Statistics Endpoint

- `GET /api/rate-limit-stats` - Get rate limit statistics

## Testing

### Using the UI

The built-in UI allows you to:
- Select different endpoints
- Switch between user roles (free, premium, admin)
- Send individual or burst requests
- View rate limit headers and responses
- Monitor real-time statistics

### Using cURL

```bash
# Anonymous request
curl http://localhost:3000/api/hello

# Free user
curl -H "Authorization: Bearer test-free-user" http://localhost:3000/api/hello

# Premium user
curl -H "Authorization: Bearer test-premium-user" http://localhost:3000/api/hello

# Admin user
curl -H "Authorization: Bearer test-admin-user" http://localhost:3000/api/hello

# Set rate limit override (admin only)
curl -X POST -H "Authorization: Bearer test-admin-user" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","maxRequests":50}' \
  http://localhost:3000/api/admin/rate-limits

# Get stats
curl http://localhost:3000/api/rate-limit-stats
```

## Rate Limit Configuration

Rate limits are defined in `src/config/ratelimit.ts`:

- **Free users**: 10 requests per minute
- **Premium users**: 50 requests per minute
- **Admin users**: 1000 requests per minute
- **Unauthenticated**: 5 requests per minute

## Architecture

The rate limiter uses:

- Effect for functional programming and error handling
- Redis for distributed rate limiting
- In-memory fallback when Redis is unavailable
- Middleware pattern for easy integration

## License

MIT
