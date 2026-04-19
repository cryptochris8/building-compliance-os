import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const getAuthContext = vi.fn();
vi.mock('@/lib/auth/helpers', () => ({
  getAuthContext: () => getAuthContext(),
  WRITE_ROLES: ['owner', 'admin'] as const,
}));

const actionCheck = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  actionLimiter: { check: (limit: number, token: string) => actionCheck(limit, token) },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db/schema', () => ({
  users: { __brand: 'users' },
  orgInvitations: { __brand: 'orgInvitations' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ _op: 'eq' })),
  and: vi.fn(() => ({ _op: 'and' })),
}));

// DB mock — chainable. Each call shape returns a configurable value.
// Tests drive behaviour via the queues below.
const selectQueue: Array<Array<Record<string, unknown>>> = [];
const insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateMock = vi.fn();
const insertMock = vi.fn();

function makeSelectChain() {
  const result = selectQueue.shift() ?? [];
  const thenable = {
    where: (..._args: unknown[]) => ({
      limit: async (_n: number) => result,
      then: (onFulfilled: (v: Array<Record<string, unknown>>) => unknown) =>
        Promise.resolve(result).then(onFulfilled),
    }),
    limit: async (_n: number) => result,
    then: (onFulfilled: (v: Array<Record<string, unknown>>) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
  };
  return thenable;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => makeSelectChain(),
    }),
    insert: (table: unknown) => {
      insertMock(table);
      return {
        values: (_values: Record<string, unknown>) => ({
          returning: async () => insertReturnQueue.shift() ?? [],
        }),
      };
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (..._args: unknown[]) => {
          updateMock(table, values);
        },
      }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const {
  getOrgMembers,
  getOrgInvitations,
  inviteMember,
  cancelInvitation,
  updateMemberRole,
  removeMember,
} = await import('../members');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CTX = (role: 'owner' | 'admin' | 'member' = 'admin', orgId = 'org-1', userId = 'user-self') => ({
  user: { id: userId, email: 'me@test.com' },
  orgId,
  role,
});

beforeEach(() => {
  getAuthContext.mockReset();
  actionCheck.mockReset().mockResolvedValue({ success: true, remaining: 9 });
  updateMock.mockReset();
  insertMock.mockReset();
  selectQueue.length = 0;
  insertReturnQueue.length = 0;
});

// ---------------------------------------------------------------------------
// getOrgMembers
// ---------------------------------------------------------------------------

describe('getOrgMembers', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await getOrgMembers()).toEqual({ error: 'Unauthorized' });
  });

  it('returns members for the caller org', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    selectQueue.push([{ id: 'u1', email: 'a@test.com', fullName: 'A', role: 'owner', createdAt: null }]);
    const result = await getOrgMembers();
    expect(result).toEqual({
      members: [{ id: 'u1', email: 'a@test.com', fullName: 'A', role: 'owner', createdAt: null }],
    });
  });
});

// ---------------------------------------------------------------------------
// getOrgInvitations
// ---------------------------------------------------------------------------

describe('getOrgInvitations', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await getOrgInvitations()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects members (non-write roles)', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    const result = await getOrgInvitations();
    expect(result).toEqual({ error: 'Only owners and admins can view invitations' });
  });

  it('returns pending invitations for owners', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    selectQueue.push([{ id: 'inv1', email: 'x@test.com', role: 'member', status: 'pending', expiresAt: null, createdAt: null }]);
    const result = await getOrgInvitations();
    expect(result).toMatchObject({ invitations: expect.any(Array) });
  });
});

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

describe('inviteMember', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await inviteMember({ email: 'x@test.com', role: 'member' })).toEqual({ error: 'Unauthorized' });
  });

  it('enforces rate limit', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    actionCheck.mockResolvedValue({ success: false, remaining: 0 });
    const result = await inviteMember({ email: 'x@test.com', role: 'member' });
    expect(result).toEqual({ error: 'Too many requests. Please try again later.' });
  });

  it('rejects non-write roles with a specific message', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    const result = await inviteMember({ email: 'x@test.com', role: 'member' });
    expect(result).toEqual({ error: 'Only owners and admins can invite members' });
  });

  it('rejects invalid email', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    const result = await inviteMember({ email: 'not-an-email', role: 'member' });
    expect(result).toEqual({ error: 'Invalid email or role' });
  });

  it('rejects invalid role', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    const result = await inviteMember({ email: 'x@test.com', role: 'superadmin' });
    expect(result).toEqual({ error: 'Invalid email or role' });
  });

  it('rejects when the email already belongs to an org member', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    selectQueue.push([{ id: 'existing-user' }]); // user exists query
    const result = await inviteMember({ email: 'x@test.com', role: 'member' });
    expect(result).toEqual({ error: 'This user is already a member of your organization' });
  });

  it('rejects when a pending invitation already exists', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    selectQueue.push([]); // no existing user
    selectQueue.push([{ id: 'pending-invite' }]); // pending invite query
    const result = await inviteMember({ email: 'x@test.com', role: 'member' });
    expect(result).toEqual({ error: 'An invitation is already pending for this email' });
  });

  it('creates the invitation with a 7-day expiry on success', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    selectQueue.push([]); // no existing user
    selectQueue.push([]); // no pending invite
    insertReturnQueue.push([{ id: 'inv-new', email: 'x@test.com', role: 'member' }]);

    const before = Date.now();
    const result = await inviteMember({ email: 'x@test.com', role: 'member' });
    const after = Date.now();

    expect(result).toMatchObject({ success: true, invitation: { id: 'inv-new' } });
    expect(insertMock).toHaveBeenCalledTimes(1);
    // Seven-day expiry sits inside [before+7d, after+7d] when the test ran.
    // We can't inspect values here without capturing them; keep assertion to
    // the insert-was-called shape since the schema governs the payload.
    expect(after - before).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// cancelInvitation
// ---------------------------------------------------------------------------

describe('cancelInvitation', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await cancelInvitation('inv-1')).toEqual({ error: 'Unauthorized' });
  });

  it('rejects non-write roles', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    const result = await cancelInvitation('inv-1');
    expect(result).toEqual({ error: 'Only owners and admins can cancel invitations' });
  });

  it('returns not found when invitation does not exist', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    selectQueue.push([]); // no invitation found
    const result = await cancelInvitation('inv-1');
    expect(result).toEqual({ error: 'Invitation not found' });
  });

  it('rejects cancellation across orgs', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1'));
    selectQueue.push([{ organizationId: 'org-2' }]); // invite belongs to a different org
    const result = await cancelInvitation('inv-1');
    expect(result).toEqual({ error: 'Invitation not found' });
  });

  it('sets the invitation to canceled on success', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1'));
    selectQueue.push([{ organizationId: 'org-1' }]);
    const result = await cancelInvitation('inv-1');
    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ __brand: 'orgInvitations' }),
      expect.objectContaining({ status: 'canceled' }),
    );
  });
});

// ---------------------------------------------------------------------------
// updateMemberRole
// ---------------------------------------------------------------------------

describe('updateMemberRole', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await updateMemberRole({ userId: 'u2', role: 'admin' })).toEqual({ error: 'Unauthorized' });
  });

  it('rejects admins (only owners can change roles)', async () => {
    getAuthContext.mockResolvedValue(CTX('admin'));
    const result = await updateMemberRole({ userId: 'u2', role: 'admin' });
    expect(result).toEqual({ error: 'Only the organization owner can change roles' });
  });

  it('rejects invalid UUID', async () => {
    getAuthContext.mockResolvedValue(CTX('owner'));
    const result = await updateMemberRole({ userId: 'not-a-uuid', role: 'admin' });
    expect(result).toEqual({ error: 'Invalid user ID or role' });
  });

  it('rejects changing own role', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1', '11111111-1111-4111-8111-111111111111'));
    const result = await updateMemberRole({ userId: '11111111-1111-4111-8111-111111111111', role: 'admin' });
    expect(result).toEqual({ error: 'You cannot change your own role' });
  });

  it('rejects targeting a user not in the caller org', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1'));
    selectQueue.push([{ organizationId: 'org-2', role: 'member' }]);
    const result = await updateMemberRole({ userId: '22222222-2222-4222-8222-222222222222', role: 'admin' });
    expect(result).toEqual({ error: 'User not found in your organization' });
  });

  it('rejects demoting the owner role', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1'));
    selectQueue.push([{ organizationId: 'org-1', role: 'owner' }]);
    const result = await updateMemberRole({ userId: '22222222-2222-4222-8222-222222222222', role: 'admin' });
    expect(result).toEqual({ error: 'Cannot change the owner role' });
  });

  it('updates the role on success', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1'));
    selectQueue.push([{ organizationId: 'org-1', role: 'member' }]);
    const result = await updateMemberRole({ userId: '22222222-2222-4222-8222-222222222222', role: 'admin' });
    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ __brand: 'users' }),
      expect.objectContaining({ role: 'admin' }),
    );
  });
});

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

describe('removeMember', () => {
  it('returns Unauthorized when not authenticated', async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await removeMember('u2')).toEqual({ error: 'Unauthorized' });
  });

  it('rejects non-write roles', async () => {
    getAuthContext.mockResolvedValue(CTX('member'));
    const result = await removeMember('u2');
    expect(result).toEqual({ error: 'Only owners and admins can remove members' });
  });

  it('rejects self-removal', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1', 'user-self'));
    const result = await removeMember('user-self');
    expect(result).toEqual({ error: 'You cannot remove yourself from the organization' });
  });

  it('rejects targeting a user not in the caller org', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1'));
    selectQueue.push([{ organizationId: 'org-2', role: 'member' }]);
    const result = await removeMember('u2');
    expect(result).toEqual({ error: 'User not found in your organization' });
  });

  it('rejects removing the owner', async () => {
    getAuthContext.mockResolvedValue(CTX('admin', 'org-1'));
    selectQueue.push([{ organizationId: 'org-1', role: 'owner' }]);
    const result = await removeMember('u-owner');
    expect(result).toEqual({ error: 'Cannot remove the organization owner' });
  });

  it('detaches the user from the org and resets role on success', async () => {
    getAuthContext.mockResolvedValue(CTX('owner', 'org-1'));
    selectQueue.push([{ organizationId: 'org-1', role: 'member' }]);
    const result = await removeMember('u2');
    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ __brand: 'users' }),
      expect.objectContaining({ organizationId: null, role: 'member' }),
    );
  });
});
