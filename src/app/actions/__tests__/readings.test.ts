import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const getAuthUser = vi.fn();
const assertBuildingAccess = vi.fn();
vi.mock('@/lib/auth/helpers', () => ({
  getAuthUser: () => getAuthUser(),
  assertBuildingAccess: (id: string, roles?: string[]) => assertBuildingAccess(id, roles),
  WRITE_ROLES: ['owner', 'admin'] as const,
}));

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------
const actionCheck = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  actionLimiter: { check: (limit: number, token: string) => actionCheck(limit, token) },
}));

// ---------------------------------------------------------------------------
// Recalculation trigger
// ---------------------------------------------------------------------------
const triggerRecalculation = vi.fn();
vi.mock('@/lib/emissions/recalculation', () => ({
  triggerRecalculation: (buildingId: string) => triggerRecalculation(buildingId),
}));

// ---------------------------------------------------------------------------
// next/cache
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// ---------------------------------------------------------------------------
// Schema + drizzle
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/schema', () => ({
  utilityReadings: { __brand: 'utilityReadings' },
  utilityAccounts: { __brand: 'utilityAccounts' },
  complianceYears: { __brand: 'complianceYears' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------
const selectQueue: Array<Array<Record<string, unknown>>> = [];
const insertReturn: Array<Array<Record<string, unknown>>> = [];
const updateReturn: Array<Array<Record<string, unknown>>> = [];
const inserts: Array<Record<string, unknown>> = [];
const updates: Array<Record<string, unknown>> = [];
const deletes: number[] = [];

function selectChain() {
  const result = selectQueue.shift() ?? [];
  return {
    from: () => ({
      where: () => ({
        limit: async (_n: number) => result,
        then: (onFulfilled: (v: Array<Record<string, unknown>>) => unknown) =>
          Promise.resolve(result).then(onFulfilled),
      }),
    }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (..._cols: unknown[]) => selectChain(),
    insert: (_table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return { returning: async () => insertReturn.shift() ?? [] };
      },
    }),
    update: (_table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return {
          where: (..._args: unknown[]) => ({
            returning: async () => updateReturn.shift() ?? [],
          }),
        };
      },
    }),
    delete: (_table: unknown) => ({
      where: async (..._args: unknown[]) => {
        deletes.push(1);
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
const { createReading, updateReading, deleteReading } = await import('../readings');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER = { id: 'user-1', email: 'me@test.com' };
const ACCESS = { orgId: 'org-1', role: 'admin' as const };

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    utilityAccountId: 'acc-1',
    buildingId: 'b1',
    periodMonth: 3,
    periodYear: 2026,
    consumptionValue: '1000',
    consumptionUnit: 'kwh',
    source: 'manual',
    confidence: 'confirmed',
    ...overrides,
  } as Parameters<typeof createReading>[0];
}

beforeEach(() => {
  getAuthUser.mockReset();
  assertBuildingAccess.mockReset();
  actionCheck.mockReset().mockResolvedValue({ success: true, remaining: 9 });
  triggerRecalculation.mockReset().mockResolvedValue(undefined);
  selectQueue.length = 0;
  insertReturn.length = 0;
  updateReturn.length = 0;
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
});

// ---------------------------------------------------------------------------
// createReading
// ---------------------------------------------------------------------------

describe('createReading', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await createReading(validPayload())).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthUser.mockResolvedValue(USER);
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await createReading(validPayload())).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects invalid period month', async () => {
    getAuthUser.mockResolvedValue(USER);
    const result = await createReading(validPayload({ periodMonth: 13 }));
    expect(result.error).toBe('Validation failed');
  });

  it('rejects negative consumption', async () => {
    getAuthUser.mockResolvedValue(USER);
    const result = await createReading(validPayload({ consumptionValue: '-5' }));
    expect(result.error).toBe('Validation failed');
  });

  it('rejects invalid consumption unit', async () => {
    getAuthUser.mockResolvedValue(USER);
    const result = await createReading(validPayload({ consumptionUnit: 'liters' }));
    expect(result.error).toBe('Validation failed');
  });

  it('denies access when building is not owned by caller org', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(null);
    expect(await createReading(validPayload())).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects a utility account that does not belong to the building', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([]); // account lookup -> none
    expect(await createReading(validPayload())).toEqual({
      error: 'Utility account not found or does not belong to this building',
    });
  });

  it('rejects creation when the compliance year is locked', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);      // account ok
    selectQueue.push([{ locked: true }]);     // year locked
    const result = await createReading(validPayload());
    expect(result.error).toMatch(/2026 is locked/);
    expect(inserts).toHaveLength(0);
  });

  it('creates a reading with correct period boundaries (March -> 2026-03-01..2026-03-31)', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);
    selectQueue.push([{ locked: false }]);
    insertReturn.push([{ id: 'r-new' }]);
    const result = await createReading(validPayload({ periodMonth: 3 }));
    expect(result).toMatchObject({ success: true, reading: { id: 'r-new' } });
    expect(inserts[0]).toMatchObject({
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      consumptionValue: '1000',
      consumptionUnit: 'kwh',
      source: 'manual',
      confidence: 'confirmed',
    });
    expect(triggerRecalculation).toHaveBeenCalledWith('b1');
  });

  it('computes Feb period end correctly for a leap year (2024 -> 29 days)', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);
    selectQueue.push([{ locked: false }]);
    insertReturn.push([{ id: 'r-new' }]);
    await createReading(validPayload({ periodMonth: 2, periodYear: 2024 }));
    expect(inserts[0]).toMatchObject({ periodStart: '2024-02-01', periodEnd: '2024-02-29' });
  });

  it('computes Feb period end correctly for a non-leap year (2026 -> 28 days)', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);
    selectQueue.push([{ locked: false }]);
    insertReturn.push([{ id: 'r-new' }]);
    await createReading(validPayload({ periodMonth: 2, periodYear: 2026 }));
    expect(inserts[0]).toMatchObject({ periodStart: '2026-02-01', periodEnd: '2026-02-28' });
  });

  it('passes optional costDollars through and coerces empty strings to null', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);
    selectQueue.push([{ locked: false }]);
    insertReturn.push([{ id: 'r-new' }]);
    await createReading(validPayload({ costDollars: '' }));
    expect(inserts[0]).toMatchObject({ costDollars: null });
  });

  it('swallows a failing recalculation trigger without failing the create', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);
    selectQueue.push([{ locked: false }]);
    insertReturn.push([{ id: 'r-new' }]);
    triggerRecalculation.mockRejectedValue(new Error('recalc boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await createReading(validPayload());
    expect(result).toMatchObject({ success: true });
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// updateReading
// ---------------------------------------------------------------------------

describe('updateReading', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await updateReading('r-1', validPayload())).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthUser.mockResolvedValue(USER);
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await updateReading('r-1', validPayload())).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects invalid payload', async () => {
    getAuthUser.mockResolvedValue(USER);
    const result = await updateReading('r-1', validPayload({ consumptionValue: 'nope' }));
    expect(result.error).toBe('Validation failed');
  });

  it('denies access when building is not owned by caller', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(null);
    expect(await updateReading('r-1', validPayload())).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects update for a locked year', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);
    selectQueue.push([{ locked: true }]);
    const result = await updateReading('r-1', validPayload());
    expect(result.error).toMatch(/locked/);
    expect(updates).toHaveLength(0);
  });

  it('updates and returns the new reading on success', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'acc-1' }]);
    selectQueue.push([{ locked: false }]);
    updateReturn.push([{ id: 'r-1', consumptionValue: '999' }]);
    const result = await updateReading('r-1', validPayload({ consumptionValue: '999' }));
    expect(result).toMatchObject({ success: true, reading: { id: 'r-1' } });
    expect(updates[0]).toMatchObject({ consumptionValue: '999' });
    expect(triggerRecalculation).toHaveBeenCalledWith('b1');
  });
});

// ---------------------------------------------------------------------------
// deleteReading
// ---------------------------------------------------------------------------

describe('deleteReading', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await deleteReading('r-1', 'b1')).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthUser.mockResolvedValue(USER);
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await deleteReading('r-1', 'b1')).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('denies access when the building is not owned by the caller', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(null);
    expect(await deleteReading('r-1', 'b1')).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects when the reading does not belong to the building', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([]); // reading lookup returns nothing
    expect(await deleteReading('r-1', 'b1')).toEqual({
      error: 'Reading not found or access denied',
    });
  });

  it('rejects deletion for a locked year (derived from periodStart)', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ periodStart: '2026-05-01' }]);
    selectQueue.push([{ locked: true }]);
    const result = await deleteReading('r-1', 'b1');
    expect(result.error).toMatch(/2026 is locked/);
    expect(deletes).toHaveLength(0);
  });

  it('deletes and triggers recalculation on success', async () => {
    getAuthUser.mockResolvedValue(USER);
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ periodStart: '2026-05-01' }]);
    selectQueue.push([{ locked: false }]);
    const result = await deleteReading('r-1', 'b1');
    expect(result).toEqual({ success: true });
    expect(deletes).toHaveLength(1);
    expect(triggerRecalculation).toHaveBeenCalledWith('b1');
  });
});
