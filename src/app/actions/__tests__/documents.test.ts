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
// Rate limit / cache / error util
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  actionLimiter: { check: vi.fn().mockResolvedValue({ success: true, remaining: 19 }) },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/utils/error', () => ({
  sanitizeErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

// ---------------------------------------------------------------------------
// Schema + drizzle
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/schema', () => ({
  documents: { id: 'documents.id', buildingId: 'documents.buildingId', filePath: 'documents.filePath' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

// ---------------------------------------------------------------------------
// DB mock — select().from().where() resolves directly to rows
// ---------------------------------------------------------------------------
const whereFn = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: whereFn }) }),
  },
}));

// ---------------------------------------------------------------------------
// Supabase storage mock
// ---------------------------------------------------------------------------
const createSignedUrl = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

import { getDocumentDownloadUrl } from '../documents';

beforeEach(() => {
  getAuthUser.mockReset();
  assertBuildingAccess.mockReset();
  whereFn.mockReset();
  createSignedUrl.mockReset();
});

describe('getDocumentDownloadUrl', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await getDocumentDownloadUrl('d1', 'b1')).toEqual({ error: 'Unauthorized' });
  });

  it('denies access when the building is not owned by the caller', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1' });
    assertBuildingAccess.mockResolvedValue(null);
    expect(await getDocumentDownloadUrl('d1', 'b1')).toEqual({
      error: 'Building not found or access denied',
    });
  });

  it('does not require write roles — read access is enough', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1' });
    assertBuildingAccess.mockResolvedValue({ orgId: 'o1', role: 'member' });
    whereFn.mockResolvedValue([{ filePath: 'b1/123-bill.pdf' }]);
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/bill.pdf' }, error: null });
    await getDocumentDownloadUrl('d1', 'b1');
    // assertBuildingAccess called without a roles argument
    expect(assertBuildingAccess).toHaveBeenCalledWith('b1', undefined);
  });

  it('returns not-found when the document does not belong to the building', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1' });
    assertBuildingAccess.mockResolvedValue({ orgId: 'o1', role: 'member' });
    whereFn.mockResolvedValue([]);
    expect(await getDocumentDownloadUrl('d1', 'b1')).toEqual({
      error: 'Document not found or access denied',
    });
  });

  it('returns a short-lived signed URL on success', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1' });
    assertBuildingAccess.mockResolvedValue({ orgId: 'o1', role: 'member' });
    whereFn.mockResolvedValue([{ filePath: 'b1/123-bill.pdf' }]);
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/bill.pdf' }, error: null });
    const result = await getDocumentDownloadUrl('d1', 'b1');
    expect(result).toEqual({ success: true, url: 'https://signed/bill.pdf' });
    expect(createSignedUrl).toHaveBeenCalledWith('b1/123-bill.pdf', 300);
  });

  it('returns an error when Supabase fails to create a signed URL', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1' });
    assertBuildingAccess.mockResolvedValue({ orgId: 'o1', role: 'member' });
    whereFn.mockResolvedValue([{ filePath: 'b1/123-bill.pdf' }]);
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'storage down' } });
    expect(await getDocumentDownloadUrl('d1', 'b1')).toEqual({
      error: 'Could not generate download link',
    });
  });
});
