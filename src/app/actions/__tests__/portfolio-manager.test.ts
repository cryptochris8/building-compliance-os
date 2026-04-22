import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const assertRole = vi.fn();
const getUserOrgId = vi.fn();
const assertBuildingAccess = vi.fn();
vi.mock('@/lib/auth/helpers', () => ({
  assertRole: (...args: unknown[]) => assertRole(...args),
  getUserOrgId: () => getUserOrgId(),
  assertBuildingAccess: (id: string, roles?: string[]) => assertBuildingAccess(id, roles),
}));

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------
const actionCheck = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  actionLimiter: { check: (limit: number, token: string) => actionCheck(limit, token) },
}));

// ---------------------------------------------------------------------------
// PM client / sync
// ---------------------------------------------------------------------------
const pmAuthenticate = vi.fn();
class PMClientMock {
  authenticate = pmAuthenticate;
}
vi.mock('@/lib/portfolio-manager/client', () => ({ PMClient: PMClientMock }));

const syncProperties = vi.fn();
const syncMeterData = vi.fn();
vi.mock('@/lib/portfolio-manager/sync', () => ({
  syncProperties: (orgId: string) => syncProperties(orgId),
  syncMeterData: (b: string, p: string, o: string) => syncMeterData(b, p, o),
}));

// ---------------------------------------------------------------------------
// Encryption + feature gate
// ---------------------------------------------------------------------------
const encrypt = vi.fn();
vi.mock('@/lib/auth/encryption', () => ({
  encrypt: (v: string) => encrypt(v),
}));

const checkAccess = vi.fn();
vi.mock('@/lib/billing/feature-gate', () => ({
  checkAccess: (orgId: string, feature: string) => checkAccess(orgId, feature),
}));

// ---------------------------------------------------------------------------
// next/cache
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ---------------------------------------------------------------------------
// Schema + drizzle
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/schema', () => ({
  pmConnections: { __brand: 'pmConnections' },
  pmPropertyMappings: { __brand: 'pmPropertyMappings' },
  buildings: { __brand: 'buildings' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------
const selectQueue: Array<Array<Record<string, unknown>>> = [];
const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const updates: Array<{ table: unknown; set: Record<string, unknown> }> = [];
const deletes: Array<unknown> = [];

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
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push({ table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table, set: values });
        return { where: async (..._a: unknown[]) => undefined };
      },
    }),
    delete: (table: unknown) => ({
      where: async (..._a: unknown[]) => {
        deletes.push(table);
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
const {
  connectPM,
  disconnectPM,
  syncPMProperties,
  linkProperty,
  unlinkProperty,
  importMeterData,
  getPMConnection,
  getPMPropertyMappings,
  getOrgBuildings,
} = await import('../portfolio-manager');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CTX = (orgId = 'org-1') => ({ user: { id: 'user-1' }, orgId, role: 'owner' as const });
const ACCESS = { orgId: 'org-1', role: 'owner' as const };

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

beforeEach(() => {
  assertRole.mockReset();
  getUserOrgId.mockReset();
  assertBuildingAccess.mockReset();
  actionCheck.mockReset().mockResolvedValue({ success: true, remaining: 4 });
  pmAuthenticate.mockReset();
  syncProperties.mockReset();
  syncMeterData.mockReset();
  encrypt.mockReset().mockReturnValue('encrypted-secret');
  checkAccess.mockReset();
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
});

// ---------------------------------------------------------------------------
// connectPM
// ---------------------------------------------------------------------------

describe('connectPM', () => {
  it('rejects non-owner/admin', async () => {
    assertRole.mockResolvedValue(null);
    expect(await connectPM(fd({ username: 'u', password: 'p' }))).toEqual({
      error: 'Unauthorized: owner or admin role required',
    });
  });

  it('enforces rate limit', async () => {
    assertRole.mockResolvedValue(CTX());
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await connectPM(fd({ username: 'u', password: 'p' }))).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('requires both username and password', async () => {
    assertRole.mockResolvedValue(CTX());
    expect(await connectPM(fd({ username: 'u' }))).toEqual({
      error: 'Username and password required',
    });
    expect(await connectPM(fd({ password: 'p' }))).toEqual({
      error: 'Username and password required',
    });
  });

  it('inserts a new connection (encrypted) when none exists', async () => {
    assertRole.mockResolvedValue(CTX());
    pmAuthenticate.mockResolvedValue(undefined);
    selectQueue.push([]); // no existing conn
    const result = await connectPM(fd({ username: 'bob', password: 'hunter2' }));
    expect(result).toEqual({ success: true });
    expect(encrypt).toHaveBeenCalledWith('hunter2');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      orgId: 'org-1',
      pmUsername: 'bob',
      pmPasswordEncrypted: 'encrypted-secret',
    });
    expect(updates).toHaveLength(0);
  });

  it('updates the existing connection when one is present', async () => {
    assertRole.mockResolvedValue(CTX());
    pmAuthenticate.mockResolvedValue(undefined);
    selectQueue.push([{ id: 'conn-1' }]); // existing conn
    const result = await connectPM(fd({ username: 'bob', password: 'new-pw' }));
    expect(result).toEqual({ success: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({
      pmUsername: 'bob',
      pmPasswordEncrypted: 'encrypted-secret',
    });
    expect(inserts).toHaveLength(0);
  });

  it('returns a sanitized error when PM authentication throws', async () => {
    assertRole.mockResolvedValue(CTX());
    pmAuthenticate.mockRejectedValue(new Error('Invalid credentials'));
    const result = await connectPM(fd({ username: 'bob', password: 'bad' }));
    expect(result.error).toBe('Invalid credentials');
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// disconnectPM
// ---------------------------------------------------------------------------

describe('disconnectPM', () => {
  it('rejects non-owner/admin', async () => {
    assertRole.mockResolvedValue(null);
    expect(await disconnectPM()).toEqual({
      error: 'Unauthorized: owner or admin role required',
    });
  });

  it('enforces rate limit', async () => {
    assertRole.mockResolvedValue(CTX());
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await disconnectPM()).toEqual({ error: 'Too many requests. Please try again later.' });
  });

  it('deletes the connection row on success', async () => {
    assertRole.mockResolvedValue(CTX());
    const result = await disconnectPM();
    expect(result).toEqual({ success: true });
    expect(deletes).toHaveLength(1);
    expect((deletes[0] as { __brand?: string })?.__brand).toBe('pmConnections');
  });
});

// ---------------------------------------------------------------------------
// syncPMProperties
// ---------------------------------------------------------------------------

describe('syncPMProperties', () => {
  it('rejects non-owner/admin', async () => {
    assertRole.mockResolvedValue(null);
    expect(await syncPMProperties()).toEqual({
      error: 'Unauthorized: owner or admin role required',
    });
  });

  it('enforces rate limit', async () => {
    assertRole.mockResolvedValue(CTX());
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await syncPMProperties()).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('rejects when plan does not include pmSync', async () => {
    assertRole.mockResolvedValue(CTX());
    checkAccess.mockResolvedValue(false);
    expect(await syncPMProperties()).toEqual({
      error: 'Portfolio Manager sync requires a Pro or Portfolio plan.',
    });
    expect(syncProperties).not.toHaveBeenCalled();
  });

  it('returns the property count on success', async () => {
    assertRole.mockResolvedValue(CTX());
    checkAccess.mockResolvedValue(true);
    syncProperties.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
    const result = await syncPMProperties();
    expect(result).toEqual({ success: true, count: 3 });
    expect(syncProperties).toHaveBeenCalledWith('org-1');
  });

  it('returns a sanitized error when syncProperties throws', async () => {
    assertRole.mockResolvedValue(CTX());
    checkAccess.mockResolvedValue(true);
    syncProperties.mockRejectedValue(new Error('PM API is down'));
    const result = await syncPMProperties();
    expect(result.error).toBe('PM API is down');
  });
});

// ---------------------------------------------------------------------------
// linkProperty
// ---------------------------------------------------------------------------

describe('linkProperty', () => {
  it('returns Unauthorized when user has no org', async () => {
    getUserOrgId.mockResolvedValue(null);
    expect(await linkProperty('pm-1', 'b-1')).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await linkProperty('pm-1', 'b-1')).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('denies when building is not owned by caller org', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    assertBuildingAccess.mockResolvedValue(null);
    expect(await linkProperty('pm-1', 'b-1')).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('returns not-found when there is no mapping for the PM property', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([]); // no mapping
    expect(await linkProperty('pm-1', 'b-1')).toEqual({ error: 'Property mapping not found' });
  });

  it('sets the buildingId and linkedAt on success', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    assertBuildingAccess.mockResolvedValue(ACCESS);
    selectQueue.push([{ id: 'map-1' }]);
    const result = await linkProperty('pm-1', 'b-1');
    expect(result).toEqual({ success: true });
    expect(updates[0].set).toMatchObject({ buildingId: 'b-1' });
    expect(updates[0].set.linkedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// unlinkProperty
// ---------------------------------------------------------------------------

describe('unlinkProperty', () => {
  it('rejects non-owner/admin', async () => {
    assertRole.mockResolvedValue(null);
    expect(await unlinkProperty('pm-1')).toEqual({
      error: 'Unauthorized: owner or admin role required',
    });
  });

  it('enforces rate limit', async () => {
    assertRole.mockResolvedValue(CTX());
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await unlinkProperty('pm-1')).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('returns not-found when mapping does not exist', async () => {
    assertRole.mockResolvedValue(CTX());
    selectQueue.push([]);
    expect(await unlinkProperty('pm-1')).toEqual({ error: 'Property mapping not found' });
  });

  it('nulls buildingId and linkedAt on success', async () => {
    assertRole.mockResolvedValue(CTX());
    selectQueue.push([{ id: 'map-1' }]);
    const result = await unlinkProperty('pm-1');
    expect(result).toEqual({ success: true });
    expect(updates[0].set).toEqual({ buildingId: null, linkedAt: null });
  });
});

// ---------------------------------------------------------------------------
// importMeterData
// ---------------------------------------------------------------------------

describe('importMeterData', () => {
  it('returns Unauthorized when user has no org', async () => {
    getUserOrgId.mockResolvedValue(null);
    expect(await importMeterData('pm-1', 'b-1')).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    expect(await importMeterData('pm-1', 'b-1')).toEqual({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('denies when building is not owned by caller org', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    assertBuildingAccess.mockResolvedValue(null);
    expect(await importMeterData('pm-1', 'b-1')).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('returns imported + meters counts on success', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    assertBuildingAccess.mockResolvedValue(ACCESS);
    syncMeterData.mockResolvedValue({ importedCount: 24, metersCount: 3 });
    const result = await importMeterData('pm-1', 'b-1');
    expect(result).toEqual({ success: true, imported: 24, meters: 3 });
    expect(syncMeterData).toHaveBeenCalledWith('b-1', 'pm-1', 'org-1');
  });

  it('returns a sanitized error when sync throws', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    assertBuildingAccess.mockResolvedValue(ACCESS);
    syncMeterData.mockRejectedValue(new Error('upstream 503'));
    const result = await importMeterData('pm-1', 'b-1');
    expect(result.error).toBe('upstream 503');
  });
});

// ---------------------------------------------------------------------------
// getPMConnection
// ---------------------------------------------------------------------------

describe('getPMConnection', () => {
  it('returns null when no org', async () => {
    getUserOrgId.mockResolvedValue(null);
    expect(await getPMConnection()).toBeNull();
  });

  it('returns null when no connection row', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    selectQueue.push([]);
    expect(await getPMConnection()).toBeNull();
  });

  it('returns the connection shape when present', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    selectQueue.push([{ id: 'c1', pmUsername: 'bob', connectedAt: null, lastSyncAt: null }]);
    const result = await getPMConnection();
    expect(result).toMatchObject({ id: 'c1', pmUsername: 'bob' });
  });
});

// ---------------------------------------------------------------------------
// getPMPropertyMappings
// ---------------------------------------------------------------------------

describe('getPMPropertyMappings', () => {
  it('returns [] when no org', async () => {
    getUserOrgId.mockResolvedValue(null);
    expect(await getPMPropertyMappings()).toEqual([]);
  });

  it('returns mappings for the caller org', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    selectQueue.push([
      { id: 'm1', pmPropertyId: 'pm-1', pmPropertyName: 'HQ', buildingId: 'b1', linkedAt: null },
    ]);
    const result = await getPMPropertyMappings();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pmPropertyId: 'pm-1' });
  });
});

// ---------------------------------------------------------------------------
// getOrgBuildings
// ---------------------------------------------------------------------------

describe('getOrgBuildings', () => {
  it('returns [] when no org', async () => {
    getUserOrgId.mockResolvedValue(null);
    expect(await getOrgBuildings()).toEqual([]);
  });

  it('returns the buildings list for the caller org', async () => {
    getUserOrgId.mockResolvedValue('org-1');
    selectQueue.push([
      { id: 'b1', name: 'HQ', addressLine1: '1 Main St' },
      { id: 'b2', name: 'Annex', addressLine1: '2 Main St' },
    ]);
    const result = await getOrgBuildings();
    expect(result).toHaveLength(2);
  });
});
