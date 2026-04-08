import { describe, it, expect, vi } from 'vitest';

// Mock Stripe so the module can load without a real key
vi.mock('stripe', () => ({
  default: vi.fn(),
}));

// Import after mocks are set up
const { tierFromPriceId, PLAN_CONFIGS } = await import('../client');

describe('tierFromPriceId', () => {
  it('maps pro monthly price ID to pro tier', () => {
    const proPriceMonthly = PLAN_CONFIGS.pro.stripePriceIdMonthly;
    expect(tierFromPriceId(proPriceMonthly)).toBe('pro');
  });

  it('maps pro annual price ID to pro tier', () => {
    const proAnnual = PLAN_CONFIGS.pro.stripePriceIdAnnual;
    expect(tierFromPriceId(proAnnual)).toBe('pro');
  });

  it('maps portfolio monthly price ID to portfolio tier', () => {
    const portfolioMonthly = PLAN_CONFIGS.portfolio.stripePriceIdMonthly;
    expect(tierFromPriceId(portfolioMonthly)).toBe('portfolio');
  });

  it('maps portfolio annual price ID to portfolio tier', () => {
    const portfolioAnnual = PLAN_CONFIGS.portfolio.stripePriceIdAnnual;
    expect(tierFromPriceId(portfolioAnnual)).toBe('portfolio');
  });

  it('returns free for an unknown price ID', () => {
    expect(tierFromPriceId('price_unknown_xyz')).toBe('free');
  });

  it('returns free for an empty string', () => {
    expect(tierFromPriceId('')).toBe('free');
  });
});

describe('PLAN_CONFIGS', () => {
  it('has free, pro, and portfolio tiers', () => {
    expect(Object.keys(PLAN_CONFIGS)).toEqual(
      expect.arrayContaining(['free', 'pro', 'portfolio'])
    );
  });

  it('free tier has empty stripe price IDs', () => {
    expect(PLAN_CONFIGS.free.stripePriceIdMonthly).toBe('');
    expect(PLAN_CONFIGS.free.stripePriceIdAnnual).toBe('');
  });

  it('pro tier has non-empty stripe price IDs', () => {
    expect(PLAN_CONFIGS.pro.stripePriceIdMonthly).toBeTruthy();
    expect(PLAN_CONFIGS.pro.stripePriceIdAnnual).toBeTruthy();
  });

  it('portfolio tier has non-empty stripe price IDs', () => {
    expect(PLAN_CONFIGS.portfolio.stripePriceIdMonthly).toBeTruthy();
    expect(PLAN_CONFIGS.portfolio.stripePriceIdAnnual).toBeTruthy();
  });
});
