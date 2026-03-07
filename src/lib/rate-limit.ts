/**
 * Create an in-memory sliding window rate limiter.
 * @param options.interval - Time window in milliseconds
 * @param options.uniqueTokenPerInterval - Max number of unique tokens tracked (prevents memory leaks)
 * @returns Object with a `check(limit, token)` method that returns `{ success, remaining }`
 */
const rateLimit = (options: { interval: number; uniqueTokenPerInterval: number }) => {
  const tokenCounts = new Map<string, { count: number; resetTime: number }>();

  // Periodic cleanup to prevent memory leaks
  const cleanup = () => {
    const now = Date.now();
    for (const [key, value] of tokenCounts) {
      if (now >= value.resetTime) {
        tokenCounts.delete(key);
      }
    }
  };

  // Cleanup every interval
  if (typeof setInterval !== 'undefined') {
    setInterval(cleanup, options.interval);
  }

  return {
    check: (limit: number, token: string): { success: boolean; remaining: number } => {
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
};

// Rate limiters for different endpoint types
export const apiLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export const authLimiter = rateLimit({
  interval: 15 * 60 * 1000, // 15 minutes
  uniqueTokenPerInterval: 500,
});

export const webhookLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});
