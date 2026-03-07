/**
 * Serverless-compatible rate limiter.
 *
 * PRODUCTION NOTE: In multi-instance deployments (Vercel serverless),
 * in-memory rate limiting provides per-instance protection only.
 * For production, replace with @upstash/ratelimit:
 *
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis } from "@upstash/redis";
 *   export const apiLimiter = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(10, "60 s"),
 *   });
 *
 * The check() API below is designed to be compatible with @upstash/ratelimit's
 * limit() return shape for easy migration.
 */

interface RateLimitResult {
  success: boolean;
  remaining: number;
}

interface RateLimiterOptions {
  /** Time window in milliseconds */
  interval: number;
  /** Max unique tokens tracked (prevents memory leaks) */
  uniqueTokenPerInterval: number;
}

function createRateLimiter(options: RateLimiterOptions) {
  const tokenCounts = new Map<string, { count: number; resetTime: number }>();

  const cleanup = () => {
    const now = Date.now();
    for (const [key, value] of tokenCounts) {
      if (now >= value.resetTime) {
        tokenCounts.delete(key);
      }
    }
  };

  // Periodic cleanup using unref'd timer to avoid holding the process open
  if (typeof setInterval !== 'undefined') {
    const timer = setInterval(cleanup, options.interval);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  }

  return {
    check: (limit: number, token: string): RateLimitResult => {
      const now = Date.now();
      const entry = tokenCounts.get(token);

      if (!entry || now >= entry.resetTime) {
        tokenCounts.set(token, { count: 1, resetTime: now + options.interval });

        // Evict oldest entries if we exceed max unique tokens
        if (tokenCounts.size > options.uniqueTokenPerInterval) {
          const firstKey = tokenCounts.keys().next().value;
          if (firstKey) tokenCounts.delete(firstKey);
        }

        return { success: true, remaining: limit - 1 };
      }

      if (entry.count >= limit) {
        return { success: false, remaining: 0 };
      }

      entry.count++;
      return { success: true, remaining: limit - entry.count };
    },
  };
}

// Rate limiters for different endpoint types
export const apiLimiter = createRateLimiter({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export const authLimiter = createRateLimiter({
  interval: 15 * 60 * 1000, // 15 minutes
  uniqueTokenPerInterval: 500,
});

export const webhookLimiter = createRateLimiter({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});
