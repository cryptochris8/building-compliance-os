import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth helper mocks
// ---------------------------------------------------------------------------
const getAuthContext = vi.fn();
const getAuthUser = vi.fn();
const assertBuildingAccess = vi.fn();
const assertRole = vi.fn();
const filterAuthorizedBuildingIds = vi.fn();

vi.mock('@/lib/auth/helpers', () => ({
  getAuthContext: () => getAuthContext(),
  getAuthUser: () => getAuthUser(),
  assertBuildingAccess: (...args: unknown[]) => assertBuildingAccess(...args),
  assertRole: (...args: unknown[]) => assertRole(...args),
  filterAuthorizedBuildingIds: (ids: string[]) => filterAuthorizedBuildingIds(ids),
  WRITE_ROLES: ['owner', 'admin'] as const,
}));

// ---------------------------------------------------------------------------
// Rate limit mock
// ---------------------------------------------------------------------------
const actionCheck = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  actionLimiter: { check: (limit: number, token: string) => actionCheck(limit, token) },
}));

// ---------------------------------------------------------------------------
// next/cache mock
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Compliance service mock
// ---------------------------------------------------------------------------
const calculateBuildingCompliance = vi.fn();
vi.mock('@/lib/emissions/compliance-service', () => ({
  calculateBuildingCompliance: (id: string, year: number) => calculateBuildingCompliance(id, year),
}));

// ---------------------------------------------------------------------------
// Schema + drizzle mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/schema', () => ({
  complianceYears: { __brand: 'complianceYears' },
  complianceActivities: { __brand: 'complianceActivities' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

// ---------------------------------------------------------------------------
// DB mock — tracks inserts/updates, returns queued select results
// ---------------------------------------------------------------------------
const selectQueue: Array<Array<Record<string, unknown>>> = [];
const activityInserts: Array<Record<string, unknown>> = [];
const updatedSets: Array<Record<string, unknown>> = [];
const bulkUpdateIds: Array<unknown> = [];

function selectChain() {
  const result = selectQueue.shift() ?? [];
  // Chainable terminal: where → { limit, orderBy, then }
  const afterWhere = {
    limit: async (_n: number) => result,
    orderBy: async (..._args: unknown[]) => result,
    then: (onFulfilled: (v: Array<Record<string, unknown>>) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
  };
  return {
    from: () => ({
      where: () => afterWhere,
    }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (..._cols: unknown[]) => selectChain(),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if ((table as { __brand?: string })?.__brand === 'complianceActivities') {
          activityInserts.push(values);
        }
      },
    }),
    update: (_table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updatedSets.push(values);
        return {
          where: async (...args: unknown[]) => {
            // For bulk where clauses, capture a marker so tests can verify bulk path
            bulkUpdateIds.push(args);
          },
        };
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const {
  updateChecklist,
  lockComplianceYear,
  unlockComplianceYear,
  addComplianceNote,
  bulkMarkSubmitted,
  bulkRecalculate,
  getComplianceActivities,
} = await import('../compliance-workflow');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CTX = (role: 'owner' | 'admin' | 'member' = 'admin') => ({
  user: { id: 'user-1' },
  orgId: 'org-1',
  role,
});
const ACCESS = { orgId: 'org-1', role: 'admin' as const };

beforeEach(() => {
  getAuthContext.mockReset();
  getAuthUser.mockReset();
  assertBuildingAccess.mockReset();
  assertRole.mockReset();
  filterAuthorizedBuildingIds.mockReset();
  actionCheck.mockReset().mockResolvedValue({ success: true, remaining: 9 });
  calculateBuildingCompliance.mockReset();
  selectQueue.length = 0;
  activityInserts.length = 0;
  updatedSets.length = 0;
  bulkUpdateIds.length = 0;
});

// ---------------------------------------------------------------------------
// updateChecklist
// ---------------------------------------------------------------------------

describe('updateChecklist', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await updateChecklist('b1', 2026, {})).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await updateChecklist('b1', 2026, {})).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects when caller lacks write access to the building', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(null);
    expect(await updateChecklist('b1', 2026, {})).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects when the compliance year does not exist', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([]); // cy lookup -> none
    expect(await updateChecklist('b1', 2026, {})).toEqual({
      error: 'Compliance year not found',
    });
  });

  it('rejects updates to a locked compliance year', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'cy1', locked: true }]);
    expect(await updateChecklist('b1', 2026, { foo: true })).toEqual({
      error: 'Compliance year is locked',
    });
  });

  it('writes checklistState and logs an activity on success', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'cy1', locked: false }]);
    const result = await updateChecklist('b1', 2026, { report_submitted: true });
    expect(result).toEqual({});
    expect(updatedSets[0]).toMatchObject({
      checklistState: { report_submitted: true },
      reportSubmitted: true,
    });
    expect(updatedSets[0].reportSubmittedAt).toBeInstanceOf(Date);
    expect(activityInserts).toHaveLength(1);
    expect(activityInserts[0]).toMatchObject({ activityType: 'checklist_update' });
  });

  it('clears reportSubmittedAt when report_submitted flips to false', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'cy1', locked: false }]);
    await updateChecklist('b1', 2026, { report_submitted: false });
    expect(updatedSets[0]).toMatchObject({ reportSubmitted: false, reportSubmittedAt: null });
  });
});

// ---------------------------------------------------------------------------
// lockComplianceYear
// ---------------------------------------------------------------------------

describe('lockComplianceYear', () => {
  it('rejects non-owners/admins', async () => {
    assertRole.mockResolvedValue(null);
    const result = await lockComplianceYear('b1', 2026);
    expect(result).toEqual({ error: 'Unauthorized: owner or admin role required' });
    expect(assertRole).toHaveBeenCalledWith('owner', 'admin');
  });

  it('enforces rate limit', async () => {
    assertRole.mockResolvedValue(CTX('owner'));
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await lockComplianceYear('b1', 2026)).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects when building access is denied', async () => {
    assertRole.mockResolvedValue(CTX('owner'));
    assertBuildingAccess.mockResolvedValue(null);
    expect(await lockComplianceYear('b1', 2026)).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects when the compliance year does not exist', async () => {
    assertRole.mockResolvedValue(CTX('owner'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([]);
    expect(await lockComplianceYear('b1', 2026)).toEqual({
      error: 'Compliance year not found',
    });
  });

  it('sets locked + lockedAt + lockedBy and logs a lock_change activity', async () => {
    assertRole.mockResolvedValue(CTX('owner'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'cy1', locked: false }]);
    const result = await lockComplianceYear('b1', 2026);
    expect(result).toEqual({});
    expect(updatedSets[0]).toMatchObject({ locked: true, lockedBy: 'user-1' });
    expect(updatedSets[0].lockedAt).toBeInstanceOf(Date);
    expect(activityInserts[0]).toMatchObject({
      activityType: 'lock_change',
      description: expect.stringContaining('locked'),
    });
  });
});

// ---------------------------------------------------------------------------
// unlockComplianceYear
// ---------------------------------------------------------------------------

describe('unlockComplianceYear', () => {
  it('rejects an empty reason', async () => {
    const result = await unlockComplianceYear('b1', 2026, '');
    expect(result.error).toMatch(/reason is required/i);
  });

  it('rejects a reason longer than 500 chars', async () => {
    const result = await unlockComplianceYear('b1', 2026, 'a'.repeat(501));
    expect(result.error).toMatch(/too long/i);
  });

  it('rejects non-owners/admins', async () => {
    assertRole.mockResolvedValue(null);
    expect(await unlockComplianceYear('b1', 2026, 'correction')).toEqual({
      error: 'Unauthorized: owner or admin role required',
    });
  });

  it('enforces rate limit', async () => {
    assertRole.mockResolvedValue(CTX('admin'));
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await unlockComplianceYear('b1', 2026, 'correction')).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('sets locked=false, stores reason, and logs an activity with the reason', async () => {
    assertRole.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'cy1', locked: true }]);
    const result = await unlockComplianceYear('b1', 2026, 'amended reading');
    expect(result).toEqual({});
    expect(updatedSets[0]).toMatchObject({ locked: false, lockReason: 'amended reading' });
    expect(activityInserts[0].description).toContain('amended reading');
  });
});

// ---------------------------------------------------------------------------
// addComplianceNote
// ---------------------------------------------------------------------------

describe('addComplianceNote', () => {
  it('rejects empty content', async () => {
    const result = await addComplianceNote('b1', 2026, '');
    expect(result.error).toMatch(/required/i);
  });

  it('rejects content over 2000 chars', async () => {
    const result = await addComplianceNote('b1', 2026, 'x'.repeat(2001));
    expect(result.error).toMatch(/too long/i);
  });

  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await addComplianceNote('b1', 2026, 'hi')).toEqual({ error: 'Unauthorized' });
  });

  it('logs a note activity linked to the compliance year when one exists', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'cy-1' }]);
    await addComplianceNote('b1', 2026, 'hello');
    expect(activityInserts[0]).toMatchObject({
      activityType: 'note',
      description: 'hello',
      complianceYearId: 'cy-1',
    });
  });

  it('still logs a note when the compliance year does not exist yet', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([]); // no cy
    const result = await addComplianceNote('b1', 2026, 'orphan note');
    expect(result).toEqual({});
    expect(activityInserts[0]).toMatchObject({
      activityType: 'note',
      complianceYearId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// bulkMarkSubmitted
// ---------------------------------------------------------------------------

describe('bulkMarkSubmitted', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await bulkMarkSubmitted(['b1'], 2026)).toEqual({ error: 'Unauthorized' });
  });

  it('rejects members (non-write role)', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    expect(await bulkMarkSubmitted(['b1'], 2026)).toEqual({
      error: 'Insufficient permissions: owner or admin role required',
    });
  });

  it('returns successCount 0 when no building IDs are authorized', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    filterAuthorizedBuildingIds.mockResolvedValue({ orgId: 'org-1', authorizedIds: [] });
    const result = await bulkMarkSubmitted(['b-other'], 2026);
    expect(result).toEqual({ successCount: 0 });
  });

  it('skips locked compliance years and reports submitted count', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    filterAuthorizedBuildingIds.mockResolvedValue({ orgId: 'org-1', authorizedIds: ['b1', 'b2', 'b3'] });
    selectQueue.push([
      { id: 'cy-1', locked: false },
      { id: 'cy-2', locked: true },
      { id: 'cy-3', locked: false },
    ]);
    const result = await bulkMarkSubmitted(['b1', 'b2', 'b3'], 2026);
    expect(result).toEqual({ successCount: 2 });
    expect(updatedSets[0]).toMatchObject({ reportSubmitted: true });
  });

  it('returns 0 when every matched compliance year is locked', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    filterAuthorizedBuildingIds.mockResolvedValue({ orgId: 'org-1', authorizedIds: ['b1'] });
    selectQueue.push([{ id: 'cy-1', locked: true }]);
    const result = await bulkMarkSubmitted(['b1'], 2026);
    expect(result).toEqual({ successCount: 0 });
    expect(updatedSets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// bulkRecalculate
// ---------------------------------------------------------------------------

describe('bulkRecalculate', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await bulkRecalculate(['b1'], 2026)).toEqual({ error: 'Unauthorized' });
  });

  it('rejects members', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    expect(await bulkRecalculate(['b1'], 2026)).toEqual({
      error: 'Insufficient permissions: owner or admin role required',
    });
  });

  it('returns 0 when nothing authorized', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    filterAuthorizedBuildingIds.mockResolvedValue({ orgId: 'org-1', authorizedIds: [] });
    const result = await bulkRecalculate(['b1'], 2026);
    expect(result).toEqual({ successCount: 0 });
    expect(calculateBuildingCompliance).not.toHaveBeenCalled();
  });

  it('skips locked buildings and recalculates unlocked ones, counting fulfilled results', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    filterAuthorizedBuildingIds.mockResolvedValue({ orgId: 'org-1', authorizedIds: ['b1', 'b2', 'b3'] });
    selectQueue.push([{ buildingId: 'b2' }]); // b2 is locked
    calculateBuildingCompliance.mockResolvedValue(undefined);
    const result = await bulkRecalculate(['b1', 'b2', 'b3'], 2026);
    expect(result).toEqual({ successCount: 2 });
    expect(calculateBuildingCompliance).toHaveBeenCalledWith('b1', 2026);
    expect(calculateBuildingCompliance).toHaveBeenCalledWith('b3', 2026);
    expect(calculateBuildingCompliance).not.toHaveBeenCalledWith('b2', 2026);
  });

  it('counts only fulfilled promises when some recalculations reject', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    filterAuthorizedBuildingIds.mockResolvedValue({ orgId: 'org-1', authorizedIds: ['b1', 'b2'] });
    selectQueue.push([]); // no locked
    calculateBuildingCompliance
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await bulkRecalculate(['b1', 'b2'], 2026);
    expect(result).toEqual({ successCount: 1 });
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getComplianceActivities
// ---------------------------------------------------------------------------

describe('getComplianceActivities', () => {
  it('returns Unauthorized with empty data when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await getComplianceActivities('b1')).toEqual({ error: 'Unauthorized', data: [] });
  });

  it('rejects when building access is denied', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(null);
    expect(await getComplianceActivities('b1')).toEqual({
      error: 'Building not found or access denied',
      data: [],
    });
  });

  it('returns activities for the caller building when authorized', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'a1', activityType: 'note', description: 'hi', metadata: null, createdAt: null, actorId: 'user-1' }]);
    const result = await getComplianceActivities('b1');
    expect(result).toEqual({
      data: [{ id: 'a1', activityType: 'note', description: 'hi', metadata: null, createdAt: null, actorId: 'user-1' }],
    });
  });
});
