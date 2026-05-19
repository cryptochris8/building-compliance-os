import { describe, it, expect, vi, beforeEach } from 'vitest';

const { limitFn, whereFn, fromFn, selectFn } = vi.hoisted(() => {
  const limitFn = vi.fn();
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { limitFn, whereFn, fromFn, selectFn };
});

vi.mock('@/lib/db', () => ({
  db: { select: selectFn },
}));

vi.mock('@/lib/db/schema', () => ({
  subscriptions: { orgId: 'subscriptions.orgId', status: 'subscriptions.status' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
}));

import { getReportWatermark } from '../watermark';

beforeEach(() => {
  limitFn.mockReset();
});

describe('getReportWatermark', () => {
  it('returns the watermark when subscription is trialing', async () => {
    limitFn.mockResolvedValue([{ status: 'trialing' }]);
    const result = await getReportWatermark('org-1');
    expect(result).toBe('TRIAL — NOT VALID FOR LL97 FILING');
  });

  it('returns null for an active subscription', async () => {
    limitFn.mockResolvedValue([{ status: 'active' }]);
    const result = await getReportWatermark('org-1');
    expect(result).toBeNull();
  });

  it('returns null for a past_due subscription (paid plan, missed payment but still entitled)', async () => {
    limitFn.mockResolvedValue([{ status: 'past_due' }]);
    const result = await getReportWatermark('org-1');
    expect(result).toBeNull();
  });

  it('returns the watermark when no subscription row exists (fail-safe)', async () => {
    limitFn.mockResolvedValue([]);
    const result = await getReportWatermark('org-1');
    expect(result).toBe('TRIAL — NOT VALID FOR LL97 FILING');
  });
});
