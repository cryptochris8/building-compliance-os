/**
 * Rate limiter with Upstash Redis support.
 *
 * Uses @upstash/ratelimit when UPSTASH_REDIS_REST_URL is configured,
 * falling back to in-memory rate limiting for local dev or single-instance.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

interface RateLimitResult {
  success: boolean;
  remaining: number;
}

interface RateLimiterLike {
  check: (limit: number, token: string) => RateLimitResult | Promise<RateLimitResult>;
}

// ---------------------------------------------------------------------------
// In-memory fallback (single-instance only)
// ---------------------------------------------------------------------------

function createInMemoryLimiter(options: { interval: number; uniqueTokenPerInterval: number }): RateLimiterLike {
  const tokenCounts = new Map<string, { count: number; resetTime: number }>();

  const cleanup = () => {
    const now = Date.now();
    for (const [key, value] of tokenCounts) {
      if (now >= value.resetTime) {
        tokenCounts.delete(key);
      }
    }
  };

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

// ---------------------------------------------------------------------------
// Upstash Redis-backed limiter
// ---------------------------------------------------------------------------

function createUpstashLimiter(windowMs: number, maxRequests: number): RateLimiterLike {
  const redis = Redis.fromEnv();
  const windowStr = `${Math.round(windowMs / 1000)} s`;
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, windowStr as `${number} s`),
    analytics: false,
  });

  return {
    check: async (_limit: number, token: string): Promise<RateLimitResult> => {
      const result = await ratelimit.limit(token);
      return { success: result.success, remaining: result.remaining };
    },
  };
}

// ---------------------------------------------------------------------------
// Factory: choose backend based on environment
// ---------------------------------------------------------------------------

const useUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

function createLimiter(windowMs: number, maxRequests: number, uniqueTokens: number): RateLimiterLike {
  if (useUpstash) {
    return createUpstashLimiter(windowMs, maxRequests);
  }
  return createInMemoryLimiter({ interval: windowMs, uniqueTokenPerInterval: uniqueTokens });
}

// Rate limiters for different endpoint types
export const apiLimiter = createLimiter(60_000, 10, 500);       // 10 req/min
export const authLimiter = createLimiter(15 * 60_000, 5, 500);  // 5 req/15min
export const webhookLimiter = createLimiter(60_000, 30, 100);   // 30 req/min
export const actionLimiter = createLimiter(60_000, 20, 500);    // 20 req/min for server actions

/**
 * Sanitize error messages before returning to the client.
 * Strips database internals, stack traces, and sensitive information.
 */
export function sanitizeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message;
  // Block messages that leak DB internals
  if (
    msg.includes('duplicate key') ||
    msg.includes('violates') ||
    msg.includes('relation "') ||
    msg.includes('column "') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('password authentication') ||
    msg.includes('SSL') ||
    msg.includes('timeout')
  ) {
    return fallback;
  }
  // Allow short, safe messages through
  if (msg.length > 200) return fallback;
  return msg;
}
