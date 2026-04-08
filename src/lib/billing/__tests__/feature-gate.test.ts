import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Use vi.hoisted so mock fns are available when vi.mock factories run
// ---------------------------------------------------------------------------
const { limitFn, whereFn, fromFn, selectFn } = vi.hoisted(() => {
  const limitFn = vi.fn();
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { limitFn, whereFn, fromFn, selectFn };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: selectFn,
    from: fromFn,
    where: whereFn,
    limit: limitFn,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  organizations: { id: 'organizations.id', subscriptionTier: 'organizations.subscriptionTier' },
  buildings: { organizationId: 'buildings.organizationId' },
  subscriptions: { orgId: 'subscriptions.orgId', trialEnd: 'subscriptions.trialEnd', status: 'subscriptions.status' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  count: vi.fn(() => 'count(*)'),
}));

import {
  getOrgTier,
  checkAccess,
  checkBuildingLimit,
  getUsage,
  isTrialActive,
} from '../feature-gate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configure the mock chain for single-query functions (getOrgTier, isTrialActive). */
function mockDbRows(rows: unknown[]) {
  limitFn.mockResolvedValue(rows);
  whereFn.mockReturnValue({ limit: limitFn });
  fromFn.mockReturnValue({ where: whereFn });
  selectFn.mockReturnValue({ from: fromFn });
}

/**
 * For functions that make two DB calls (e.g. getOrgTier then count),
 * return different values on successive select() calls.
 */
function mockDbSequence(firstRows: unknown[], secondRows: unknown[]) {
  let callCount = 0;

  selectFn.mockImplementation(() => {
    callCount++;
    const rows = callCount === 1 ? firstRows : secondRows;
    const innerWhere = vi.fn().mockImplementation(() => {
      const obj: Record<string, unknown> = {
        limit: vi.fn().mockResolvedValue(rows),
      };
      // Make thenable for queries without .limit()
      obj['then'] = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
      return obj;
    });
    const innerFrom = vi.fn().mockReturnValue({ where: innerWhere });
    return { from: innerFrom };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// getOrgTier
// ===========================================================================
describe('getOrgTier', () => {
  it('returns "free" when org is not found', async () => {
    mockDbRows([]);
    expect(await getOrgTier('org-missing')).toBe('free');
  });

  it('returns "pro" when org has pro tier', async () => {
    mockDbRows([{ tier: 'pro' }]);
    expect(await getOrgTier('org-pro')).toBe('pro');
  });

  it('returns "portfolio" when org has portfolio tier', async () => {
    mockDbRows([{ tier: 'portfolio' }]);
    expect(await getOrgTier('org-portfolio')).toBe('portfolio');
  });

  it('returns "free" when tier is null', async () => {
    mockDbRows([{ tier: null }]);
    expect(await getOrgTier('org-null')).toBe('free');
  });
});

// ===========================================================================
// checkAccess
// ===========================================================================
describe('checkAccess', () => {
  it('free tier cannot access csvUpload', async () => {
    mockDbRows([{ tier: 'free' }]);
    expect(await checkAccess('org-free', 'csvUpload')).toBe(false);
  });

  it('free tier cannot access reportGeneration', async () => {
    mockDbRows([{ tier: 'free' }]);
    expect(await checkAccess('org-free', 'reportGeneration')).toBe(false);
  });

  it('free tier cannot access pmSync', async () => {
    mockDbRows([{ tier: 'free' }]);
    expect(await checkAccess('org-free', 'pmSync')).toBe(false);
  });

  it('free tier cannot access bulkOperations', async () => {
    mockDbRows([{ tier: 'free' }]);
    expect(await checkAccess('org-free', 'bulkOperations')).toBe(false);
  });

  it('pro tier can access csvUpload', async () => {
    mockDbRows([{ tier: 'pro' }]);
    expect(await checkAccess('org-pro', 'csvUpload')).toBe(true);
  });

  it('pro tier can access reportGeneration', async () => {
    mockDbRows([{ tier: 'pro' }]);
    expect(await checkAccess('org-pro', 'reportGeneration')).toBe(true);
  });

  it('pro tier can access pmSync', async () => {
    mockDbRows([{ tier: 'pro' }]);
    expect(await checkAccess('org-pro', 'pmSync')).toBe(true);
  });

  it('pro tier cannot access bulkOperations', async () => {
    mockDbRows([{ tier: 'pro' }]);
    expect(await checkAccess('org-pro', 'bulkOperations')).toBe(false);
  });

  it('portfolio tier can access csvUpload', async () => {
    mockDbRows([{ tier: 'portfolio' }]);
    expect(await checkAccess('org-port', 'csvUpload')).toBe(true);
  });

  it('portfolio tier can access bulkOperations', async () => {
    mockDbRows([{ tier: 'portfolio' }]);
    expect(await checkAccess('org-port', 'bulkOperations')).toBe(true);
  });
});

// ===========================================================================
// checkBuildingLimit
// ===========================================================================
describe('checkBuildingLimit', () => {
  it('free tier with 0 buildings is allowed (limit 1)', async () => {
    mockDbSequence([{ tier: 'free' }], [{ value: 0 }]);
    const result = await checkBuildingLimit('org-free');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.limit).toBe(1);
    expect(result.tier).toBe('free');
  });

  it('free tier with 1 building is NOT allowed', async () => {
    mockDbSequence([{ tier: 'free' }], [{ value: 1 }]);
    const result = await checkBuildingLimit('org-free');
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(1);
  });

  it('pro tier with 9 buildings is allowed (limit 10)', async () => {
    mockDbSequence([{ tier: 'pro' }], [{ value: 9 }]);
    const result = await checkBuildingLimit('org-pro');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(9);
    expect(result.limit).toBe(10);
  });

  it('pro tier with 10 buildings is NOT allowed', async () => {
    mockDbSequence([{ tier: 'pro' }], [{ value: 10 }]);
    const result = await checkBuildingLimit('org-pro');
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(10);
    expect(result.limit).toBe(10);
  });

  it('portfolio tier with 49 buildings is allowed (limit 50)', async () => {
    mockDbSequence([{ tier: 'portfolio' }], [{ value: 49 }]);
    const result = await checkBuildingLimit('org-port');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(49);
    expect(result.limit).toBe(50);
  });
});

// ===========================================================================
// getUsage
// ===========================================================================
describe('getUsage', () => {
  it('returns full usage summary for free tier', async () => {
    mockDbSequence([{ tier: 'free' }], [{ value: 1 }]);
    const usage = await getUsage('org-free');
    expect(usage.tier).toBe('free');
    expect(usage.buildingCount).toBe(1);
    expect(usage.buildingLimit).toBe(1);
    expect(usage.features.csvUpload).toBe(false);
    expect(usage.features.reportGeneration).toBe(false);
    expect(usage.features.pmSync).toBe(false);
    expect(usage.features.bulkOperations).toBe(false);
  });

  it('returns full usage summary for pro tier', async () => {
    mockDbSequence([{ tier: 'pro' }], [{ value: 5 }]);
    const usage = await getUsage('org-pro');
    expect(usage.tier).toBe('pro');
    expect(usage.buildingCount).toBe(5);
    expect(usage.buildingLimit).toBe(10);
    expect(usage.features.csvUpload).toBe(true);
    expect(usage.features.reportGeneration).toBe(true);
    expect(usage.features.pmSync).toBe(true);
    expect(usage.features.bulkOperations).toBe(false);
  });

  it('returns full usage summary for portfolio tier', async () => {
    mockDbSequence([{ tier: 'portfolio' }], [{ value: 20 }]);
    const usage = await getUsage('org-port');
    expect(usage.tier).toBe('portfolio');
    expect(usage.buildingCount).toBe(20);
    expect(usage.buildingLimit).toBe(50);
    expect(usage.features.csvUpload).toBe(true);
    expect(usage.features.bulkOperations).toBe(true);
  });

  it('defaults buildingCount to 0 when no result', async () => {
    mockDbSequence([{ tier: 'free' }], []);
    const usage = await getUsage('org-empty');
    expect(usage.buildingCount).toBe(0);
  });
});

// ===========================================================================
// isTrialActive
// ===========================================================================
describe('isTrialActive', () => {
  it('returns inactive when no subscription found', async () => {
    mockDbRows([]);
    const result = await isTrialActive('org-nosub');
    expect(result.active).toBe(false);
    expect(result.daysRemaining).toBe(0);
    expect(result.trialEnd).toBeNull();
  });

  it('returns inactive when trialEnd is null', async () => {
    mockDbRows([{ trialEnd: null, status: 'active' }]);
    const result = await isTrialActive('org-notrial');
    expect(result.active).toBe(false);
    expect(result.daysRemaining).toBe(0);
    expect(result.trialEnd).toBeNull();
  });

  it('returns inactive when trial has ended (past date)', async () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    mockDbRows([{ trialEnd: pastDate.toISOString(), status: 'trialing' }]);
    const result = await isTrialActive('org-expired');
    expect(result.active).toBe(false);
    expect(result.daysRemaining).toBe(0);
  });

  it('returns active with correct daysRemaining for active trial', async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    mockDbRows([{ trialEnd: futureDate.toISOString(), status: 'trialing' }]);
    const result = await isTrialActive('org-trial');
    expect(result.active).toBe(true);
    expect(result.daysRemaining).toBe(10);
    expect(result.trialEnd).toBeInstanceOf(Date);
  });

  it('returns inactive when status is not "trialing" even with future trialEnd', async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    mockDbRows([{ trialEnd: futureDate.toISOString(), status: 'active' }]);
    const result = await isTrialActive('org-active');
    expect(result.active).toBe(false);
    expect(result.daysRemaining).toBe(5);
  });
});
