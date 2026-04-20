import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const getAuthContext = vi.fn();
const getAuthUser = vi.fn();
const assertBuildingAccess = vi.fn();
vi.mock('@/lib/auth/helpers', () => ({
  getAuthContext: () => getAuthContext(),
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
// next/cache
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// ---------------------------------------------------------------------------
// Schema + drizzle
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/schema', () => ({
  deductions: { __brand: 'deductions' },
  complianceYears: { __brand: 'complianceYears' },
  complianceActivities: { __brand: 'complianceActivities' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

// ---------------------------------------------------------------------------
// DB mock (outer-db selects + transaction)
// ---------------------------------------------------------------------------
const outerSelectQueue: Array<Array<Record<string, unknown>>> = [];

// Tx-scoped state is set per-test via the configureTx helper.
interface TxState {
  selectQueue: Array<Array<Record<string, unknown>>>;
  insertReturn: Array<Array<Record<string, unknown>>>;
  updateReturn: Array<Array<Record<string, unknown>>>;
  inserts: Array<{ table: unknown; values: Record<string, unknown> }>;
  updates: Array<{ table: unknown; set: Record<string, unknown> }>;
  deletes: Array<unknown>;
}

let txState: TxState = {
  selectQueue: [],
  insertReturn: [],
  updateReturn: [],
  inserts: [],
  updates: [],
  deletes: [],
};

function makeTx() {
  return {
    select: (..._cols: unknown[]) => ({
      from: (_table: unknown) => ({
        where: () => {
          const result = txState.selectQueue.shift() ?? [];
          return {
            limit: async (_n: number) => result,
            then: (onFulfilled: (v: Array<Record<string, unknown>>) => unknown) =>
              Promise.resolve(result).then(onFulfilled),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        txState.inserts.push({ table, values });
        return { returning: async () => txState.insertReturn.shift() ?? [] };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        txState.updates.push({ table, set: values });
        return {
          where: (..._args: unknown[]) => ({
            returning: async () => txState.updateReturn.shift() ?? [],
          }),
        };
      },
    }),
    delete: (_table: unknown) => ({
      where: async (..._args: unknown[]) => {
        txState.deletes.push(1);
      },
    }),
  };
}

function outerSelectChain() {
  const result = outerSelectQueue.shift() ?? [];
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

const transactionRunner = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (..._cols: unknown[]) => outerSelectChain(),
    transaction: (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => transactionRunner(fn),
  },
}));

// Default tx runner: run the callback against a fresh tx mock.
beforeEach(() => {
  transactionRunner.mockReset().mockImplementation(async (fn) => fn(makeTx()));
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
const { createDeduction, updateDeduction, deleteDeduction, getDeductions } = await import('../deductions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CTX = (role: 'owner' | 'admin' | 'member' = 'admin') => ({
  user: { id: 'user-1' },
  orgId: 'org-1',
  role,
});
const ACCESS = { orgId: 'org-1', role: 'admin' as const };

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    buildingId: 'b1',
    complianceYearId: 'cy-1',
    deductionType: 'purchased_recs',
    amountTco2e: '5',
    ...overrides,
  } as Parameters<typeof createDeduction>[0];
}

beforeEach(() => {
  getAuthContext.mockReset();
  getAuthUser.mockReset();
  assertBuildingAccess.mockReset();
  actionCheck.mockReset().mockResolvedValue({ success: true, remaining: 9 });
  outerSelectQueue.length = 0;
  txState = {
    selectQueue: [],
    insertReturn: [],
    updateReturn: [],
    inserts: [],
    updates: [],
    deletes: [],
  };
});

// ---------------------------------------------------------------------------
// createDeduction
// ---------------------------------------------------------------------------

describe('createDeduction', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await createDeduction(validPayload())).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthContext.mockResolvedValue(CTX());
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await createDeduction(validPayload())).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects invalid deduction type', async () => {
    getAuthContext.mockResolvedValue(CTX());
    expect(await createDeduction(validPayload({ deductionType: 'invalid' }))).toEqual({
      error: 'Validation failed',
    });
  });

  it('rejects non-positive amount', async () => {
    getAuthContext.mockResolvedValue(CTX());
    expect(await createDeduction(validPayload({ amountTco2e: '0' }))).toEqual({
      error: 'Validation failed',
    });
  });

  it('denies access when building is not owned by caller org', async () => {
    getAuthContext.mockResolvedValue(CTX());
    assertBuildingAccess.mockResolvedValue(null);
    expect(await createDeduction(validPayload())).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects when compliance year does not belong to the building', async () => {
    getAuthContext.mockResolvedValue(CTX());
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([]); // CY lookup -> none
    expect(await createDeduction(validPayload())).toEqual({
      error: 'Compliance year not found for this building',
    });
  });

  it('rejects when compliance year is locked', async () => {
    getAuthContext.mockResolvedValue(CTX());
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1', year: 2026, locked: true }]);
    expect(await createDeduction(validPayload())).toEqual({
      error: 'Compliance year is locked',
    });
  });

  it('inserts the deduction, recomputes totals, and logs an activity in a single transaction', async () => {
    getAuthContext.mockResolvedValue(CTX());
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1', year: 2026, locked: false, totalEmissionsTco2e: '100' }]);

    // tx-scoped: first select is all deductions for the CY (for totals),
    // second is the CY gross emissions lookup.
    txState.selectQueue.push([{ amountTco2e: '5' }, { amountTco2e: '3' }]);
    txState.selectQueue.push([{ totalEmissionsTco2e: '100' }]);
    txState.insertReturn.push([{ id: 'ded-new' }]);

    const result = await createDeduction(validPayload({ amountTco2e: '5' }));

    expect(result).toMatchObject({ success: true, deduction: { id: 'ded-new' } });

    // Deduction row inserted
    const deductionInsert = txState.inserts.find(
      (i) => (i.table as { __brand?: string })?.__brand === 'deductions',
    );
    expect(deductionInsert?.values).toMatchObject({
      buildingId: 'b1',
      complianceYearId: 'cy-1',
      orgId: 'org-1',
      deductionType: 'purchased_recs',
      amountTco2e: '5',
    });

    // Totals updated: 5 + 3 = 8 total deductions, net = 100 - 8 = 92
    const cyUpdate = txState.updates.find(
      (u) => (u.table as { __brand?: string })?.__brand === 'complianceYears',
    );
    expect(cyUpdate?.set).toMatchObject({
      totalDeductionsTco2e: '8',
      netEmissionsTco2e: '92',
    });

    // Activity logged
    const activityInsert = txState.inserts.find(
      (i) => (i.table as { __brand?: string })?.__brand === 'complianceActivities',
    );
    expect(activityInsert?.values).toMatchObject({
      activityType: 'deduction_change',
      description: expect.stringContaining('purchased_recs'),
    });
  });

  it('floors net emissions at zero when deductions exceed gross', async () => {
    getAuthContext.mockResolvedValue(CTX());
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1', year: 2026, locked: false }]);
    txState.selectQueue.push([{ amountTco2e: '150' }]); // deductions exceed gross
    txState.selectQueue.push([{ totalEmissionsTco2e: '100' }]);
    txState.insertReturn.push([{ id: 'd1' }]);

    await createDeduction(validPayload({ amountTco2e: '150' }));
    const cyUpdate = txState.updates.find(
      (u) => (u.table as { __brand?: string })?.__brand === 'complianceYears',
    );
    expect(cyUpdate?.set).toMatchObject({ netEmissionsTco2e: '0' });
  });
});

// ---------------------------------------------------------------------------
// updateDeduction
// ---------------------------------------------------------------------------

describe('updateDeduction', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await updateDeduction('d1', validPayload())).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await updateDeduction('d1', validPayload())).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects invalid payload', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    expect(await updateDeduction('d1', validPayload({ amountTco2e: 'nope' }))).toEqual({
      error: 'Validation failed',
    });
  });

  it('denies access when building is not owned', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(null);
    expect(await updateDeduction('d1', validPayload())).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects when compliance year is locked', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1', year: 2026, locked: true }]);
    expect(await updateDeduction('d1', validPayload())).toEqual({
      error: 'Compliance year is locked',
    });
  });

  it('updates the deduction and recomputes totals on success', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1', year: 2026, locked: false }]);
    txState.selectQueue.push([{ amountTco2e: '10' }]);
    txState.selectQueue.push([{ totalEmissionsTco2e: '50' }]);
    txState.updateReturn.push([{ id: 'd1', amountTco2e: '10' }]);

    const result = await updateDeduction('d1', validPayload({ amountTco2e: '10' }));
    expect(result).toMatchObject({ success: true, deduction: { id: 'd1' } });

    const deductionUpdate = txState.updates.find(
      (u) => (u.table as { __brand?: string })?.__brand === 'deductions',
    );
    expect(deductionUpdate?.set).toMatchObject({ amountTco2e: '10' });

    const cyUpdate = txState.updates.find(
      (u) => (u.table as { __brand?: string })?.__brand === 'complianceYears',
    );
    expect(cyUpdate?.set).toMatchObject({ totalDeductionsTco2e: '10', netEmissionsTco2e: '40' });
  });
});

// ---------------------------------------------------------------------------
// deleteDeduction
// ---------------------------------------------------------------------------

describe('deleteDeduction', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await deleteDeduction('d1', 'b1', 'cy-1')).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await deleteDeduction('d1', 'b1', 'cy-1')).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('denies access when building is not owned', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(null);
    expect(await deleteDeduction('d1', 'b1', 'cy-1')).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('rejects when compliance year is locked', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1', year: 2026, locked: true }]);
    expect(await deleteDeduction('d1', 'b1', 'cy-1')).toEqual({
      error: 'Compliance year is locked',
    });
  });

  it('deletes the deduction and recomputes totals on success', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1', year: 2026, locked: false }]);
    txState.selectQueue.push([]); // no remaining deductions after delete
    txState.selectQueue.push([{ totalEmissionsTco2e: '50' }]);

    const result = await deleteDeduction('d1', 'b1', 'cy-1');
    expect(result).toEqual({ success: true });
    expect(txState.deletes).toHaveLength(1);

    const cyUpdate = txState.updates.find(
      (u) => (u.table as { __brand?: string })?.__brand === 'complianceYears',
    );
    expect(cyUpdate?.set).toMatchObject({ totalDeductionsTco2e: '0', netEmissionsTco2e: '50' });
  });
});

// ---------------------------------------------------------------------------
// getDeductions
// ---------------------------------------------------------------------------

describe('getDeductions', () => {
  it('returns Unauthorized with empty data when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await getDeductions('b1', 2026)).toEqual({ error: 'Unauthorized', data: [] });
  });

  it('rejects when building access is denied', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(null);
    expect(await getDeductions('b1', 2026)).toEqual({
      error: 'Building not found or access denied',
      data: [],
    });
  });

  it('returns empty data when the compliance year does not exist', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([]); // no CY
    expect(await getDeductions('b1', 2026)).toEqual({ data: [] });
  });

  it('returns deductions for the matched compliance year', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-1' });
    assertBuildingAccess.mockResolvedValue(ACCESS);
    outerSelectQueue.push([{ id: 'cy-1' }]);
    outerSelectQueue.push([{ id: 'd1', amountTco2e: '5' }, { id: 'd2', amountTco2e: '3' }]);
    const result = await getDeductions('b1', 2026);
    expect(result).toEqual({ data: [{ id: 'd1', amountTco2e: '5' }, { id: 'd2', amountTco2e: '3' }] });
  });
});
