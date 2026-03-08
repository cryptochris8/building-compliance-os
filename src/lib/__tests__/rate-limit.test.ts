import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Upstash modules so they don't try to connect
vi.mock('@upstash/ratelimit', () => ({ Ratelimit: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: vi.fn() } }));

// Force in-memory mode by clearing env vars before importing
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// Dynamic import after env is set
const { apiLimiter, authLimiter } = await import('../rate-limit');

describe('In-memory rate limiter', () => {
  it('allows requests within the limit', async () => {
    const token = 'test-token-' + Date.now();
    const result = await apiLimiter.check(5, token);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('decrements remaining on each call', async () => {
    const token = 'decrement-' + Date.now();
    const r1 = await apiLimiter.check(3, token);
    const r2 = await apiLimiter.check(3, token);
    const r3 = await apiLimiter.check(3, token);
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests over the limit', async () => {
    const token = 'block-' + Date.now();
    await apiLimiter.check(2, token);
    await apiLimiter.check(2, token);
    const result = await apiLimiter.check(2, token);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks tokens independently', async () => {
    const tokenA = 'a-' + Date.now();
    const tokenB = 'b-' + Date.now();
    await apiLimiter.check(1, tokenA);
    const resultA = await apiLimiter.check(1, tokenA);
    const resultB = await apiLimiter.check(1, tokenB);
    expect(resultA.success).toBe(false);
    expect(resultB.success).toBe(true);
  });

  it('uses different limiters for different endpoint types', async () => {
    const token = 'multi-' + Date.now();
    // apiLimiter and authLimiter are separate instances
    const apiResult = await apiLimiter.check(1, token);
    const authResult = await authLimiter.check(1, token);
    expect(apiResult.success).toBe(true);
    expect(authResult.success).toBe(true);
  });
});
