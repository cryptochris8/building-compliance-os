import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const getAuthContext = vi.fn();
const assertBuildingAccess = vi.fn();
vi.mock('@/lib/auth/helpers', () => ({
  getAuthContext: () => getAuthContext(),
  assertBuildingAccess: (buildingId: string, roles?: string[]) => assertBuildingAccess(buildingId, roles),
  WRITE_ROLES: ['owner', 'admin'] as const,
}));

const actionCheck = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  actionLimiter: { check: (limit: number, token: string) => actionCheck(limit, token) },
}));

const checkBuildingLimit = vi.fn();
vi.mock('@/lib/billing/feature-gate', () => ({
  checkBuildingLimit: (orgId: string) => checkBuildingLimit(orgId),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db/schema', () => ({
  buildings: { __brand: 'buildings' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

// The server action imports buildingFormSchema from a "use client" form
// component. Re-define the schema inline so the test isn't dragged into
// react-hook-form and the heavy form UI.
vi.mock('@/components/buildings/building-form', () => ({
  buildingFormSchema: z.object({
    name: z.string().min(1),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(2).max(2),
    zip: z.string().min(5),
    borough: z.string().optional(),
    bbl: z.string().optional(),
    bin: z.string().optional(),
    grossSqft: z.string().min(1).refine((v) => !isNaN(Number(v)) && Number(v) > 0),
    yearBuilt: z.string().optional(),
    occupancyType: z.string().min(1),
    jurisdictionId: z.string().min(1),
    notes: z.string().optional(),
  }),
}));

// DB mock — track insert/update/delete payloads and let select().from().where()
// return a shifted result.
const insertValues = vi.fn();
const updateValues = vi.fn();
const deleteCalls = vi.fn();
const insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateReturnQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => ({
  db: {
    insert: (_table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        insertValues(values);
        return {
          returning: async () => insertReturnQueue.shift() ?? [],
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updateValues(values);
        return {
          where: (..._args: unknown[]) => ({
            returning: async () => updateReturnQueue.shift() ?? [],
          }),
        };
      },
    }),
    delete: (_table: unknown) => ({
      where: async (..._args: unknown[]) => {
        deleteCalls();
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { createBuilding, updateBuilding, deleteBuilding } = await import('../buildings');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CTX = (role: 'owner' | 'admin' | 'member' = 'admin') => ({
  user: { id: 'user-1' },
  orgId: 'org-1',
  role,
});

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Building',
    addressLine1: '1 Main St',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    grossSqft: '50000',
    occupancyType: 'office',
    jurisdictionId: 'nyc-ll97',
    ...overrides,
  } as Parameters<typeof createBuilding>[0];
}

beforeEach(() => {
  getAuthContext.mockReset();
  assertBuildingAccess.mockReset();
  actionCheck.mockReset().mockResolvedValue({ success: true, remaining: 9 });
  checkBuildingLimit.mockReset().mockResolvedValue({ allowed: true, current: 0, limit: 10 });
  insertValues.mockReset();
  updateValues.mockReset();
  deleteCalls.mockReset();
  insertReturnQueue.length = 0;
  updateReturnQueue.length = 0;
});

// ---------------------------------------------------------------------------
// createBuilding
// ---------------------------------------------------------------------------

describe('createBuilding', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await createBuilding(validPayload())).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await createBuilding(validPayload())).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects invalid payload (empty name)', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    expect(await createBuilding(validPayload({ name: '' }))).toEqual({ error: 'Validation failed' });
  });

  it('rejects invalid payload (non-positive gross sqft)', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    expect(await createBuilding(validPayload({ grossSqft: '0' }))).toEqual({ error: 'Validation failed' });
  });

  it('rejects members (non-write role)', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    const result = await createBuilding(validPayload());
    expect(result).toEqual({ error: 'Only owners and admins can add buildings' });
  });

  it('blocks creation when plan building limit is reached', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    checkBuildingLimit.mockResolvedValue({ allowed: false, current: 1, limit: 1 });
    const result = await createBuilding(validPayload());
    expect(result.error).toMatch(/limit reached.*1\/1/i);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('uppercases state and coerces numeric fields on insert', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    insertReturnQueue.push([{ id: 'b-new' }]);
    const result = await createBuilding(validPayload({ state: 'ny', yearBuilt: '2001' }));
    expect(result).toMatchObject({ success: true, building: { id: 'b-new' } });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        state: 'NY',
        yearBuilt: 2001,
        occupancyType: 'office',
        jurisdictionId: 'nyc-ll97',
      }),
    );
  });

  it('passes through optional fields as null when omitted', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    insertReturnQueue.push([{ id: 'b-new' }]);
    await createBuilding(validPayload());
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLine2: null,
        borough: null,
        bbl: null,
        bin: null,
        yearBuilt: null,
        notes: null,
      }),
    );
  });

  it('returns a generic error when DB insert throws', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    // Make insert throw by pushing a rejected returning
    insertReturnQueue.push([]);
    // Override insert once to throw
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = await import('@/lib/db');
    const originalInsert = db.insert;
    db.insert = (() => {
      throw new Error('kaboom');
    }) as typeof db.insert;
    const result = await createBuilding(validPayload());
    db.insert = originalInsert;
    errSpy.mockRestore();
    expect(result).toEqual({ error: 'Failed to create building' });
  });
});

// ---------------------------------------------------------------------------
// updateBuilding
// ---------------------------------------------------------------------------

describe('updateBuilding', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await updateBuilding('b-1', validPayload())).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await updateBuilding('b-1', validPayload())).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects invalid payload', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    expect(await updateBuilding('b-1', validPayload({ zip: '1' }))).toEqual({ error: 'Validation failed' });
  });

  it('denies access when building does not belong to the org', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(null);
    expect(await updateBuilding('b-1', validPayload())).toEqual({ error: 'Unauthorized' });
    expect(updateValues).not.toHaveBeenCalled();
  });

  it('updates the building on success and sets updatedAt', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    assertBuildingAccess.mockResolvedValue({ orgId: 'org-1', role: 'owner' });
    updateReturnQueue.push([{ id: 'b-1', name: 'Updated' }]);

    const result = await updateBuilding('b-1', validPayload({ name: 'Updated', state: 'ca' }));

    expect(result).toMatchObject({ success: true, building: { id: 'b-1' } });
    expect(updateValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated', state: 'CA', updatedAt: expect.any(Date) }),
    );
  });

  it('passes WRITE_ROLES to assertBuildingAccess', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue({ orgId: 'org-1', role: 'admin' });
    updateReturnQueue.push([{ id: 'b-1' }]);
    await updateBuilding('b-1', validPayload());
    expect(assertBuildingAccess).toHaveBeenCalledWith('b-1', ['owner', 'admin']);
  });
});

// ---------------------------------------------------------------------------
// deleteBuilding
// ---------------------------------------------------------------------------

describe('deleteBuilding', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await deleteBuilding('b-1')).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await deleteBuilding('b-1')).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('denies delete for foreign building', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    assertBuildingAccess.mockResolvedValue(null);
    expect(await deleteBuilding('b-1')).toEqual({ error: 'Unauthorized' });
    expect(deleteCalls).not.toHaveBeenCalled();
  });

  it('deletes and returns success when authorized', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    assertBuildingAccess.mockResolvedValue({ orgId: 'org-1', role: 'owner' });
    const result = await deleteBuilding('b-1');
    expect(result).toEqual({ success: true });
    expect(deleteCalls).toHaveBeenCalledTimes(1);
  });
});
