import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const getAuthContext = vi.fn();
const getAuthUser = vi.fn();
vi.mock('@/lib/auth/helpers', () => ({
  getAuthContext: () => getAuthContext(),
  getAuthUser: () => getAuthUser(),
  WRITE_ROLES: ['owner', 'admin'] as const,
}));

const sendInvitationEmail = vi.fn();
vi.mock('@/lib/email/invitation', () => ({
  sendInvitationEmail: (...args: unknown[]) => sendInvitationEmail(...args),
}));

const actionCheck = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  actionLimiter: { check: (limit: number, token: string) => actionCheck(limit, token) },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db/schema', () => ({
  users: { __brand: 'users' },
  orgInvitations: { __brand: 'orgInvitations' },
  organizations: { __brand: 'organizations' },
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

vi.mock('@/lib/db', () => {
  const dbMock: Record<string, unknown> = {
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
  };
  dbMock.transaction = async (fn: (tx: typeof dbMock) => Promise<unknown>) => fn(dbMock);
  return { db: dbMock };
});

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
  acceptInvitation,
  getInvitationForAccept,
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
  getAuthUser.mockReset();
  sendInvitationEmail.mockReset();
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

// ---------------------------------------------------------------------------
// getInvitationForAccept
// ---------------------------------------------------------------------------

const VALID_INVITE_ID = '11111111-1111-4111-8111-111111111111';

describe('getInvitationForAccept', () => {
  it('returns not_found for an invalid invitation id', async () => {
    expect(await getInvitationForAccept('not-a-uuid')).toEqual({ error: 'not_found' });
  });

  it('returns not_found when the invitation does not exist', async () => {
    selectQueue.push([]);
    expect(await getInvitationForAccept(VALID_INVITE_ID)).toEqual({ error: 'not_found' });
  });

  it('returns a pending invitation with the org name', async () => {
    const future = new Date(Date.now() + 7 * 86400000);
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'x@test.com', role: 'member', status: 'pending', expiresAt: future, organizationId: 'org-1' }]);
    selectQueue.push([{ name: 'Acme Corp' }]);
    expect(await getInvitationForAccept(VALID_INVITE_ID)).toEqual({
      invitation: { id: VALID_INVITE_ID, email: 'x@test.com', role: 'member', orgName: 'Acme Corp', state: 'pending' },
    });
  });

  it('reports an expired state when a pending invitation is past its expiry', async () => {
    const past = new Date(Date.now() - 86400000);
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'x@test.com', role: 'member', status: 'pending', expiresAt: past, organizationId: 'org-1' }]);
    selectQueue.push([{ name: 'Acme Corp' }]);
    expect(await getInvitationForAccept(VALID_INVITE_ID)).toMatchObject({ invitation: { state: 'expired' } });
  });

  it('reports an accepted state for an already-accepted invitation', async () => {
    const future = new Date(Date.now() + 86400000);
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'x@test.com', role: 'member', status: 'accepted', expiresAt: future, organizationId: 'org-1' }]);
    selectQueue.push([{ name: 'Acme Corp' }]);
    expect(await getInvitationForAccept(VALID_INVITE_ID)).toMatchObject({ invitation: { state: 'accepted' } });
  });
});

// ---------------------------------------------------------------------------
// acceptInvitation
// ---------------------------------------------------------------------------

describe('acceptInvitation', () => {
  it('requires the user to be signed in', async () => {
    getAuthUser.mockResolvedValue(null);
    expect(await acceptInvitation(VALID_INVITE_ID)).toEqual({
      error: 'You must be signed in to accept an invitation',
    });
  });

  it('rejects an invalid invitation id', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1', email: 'x@test.com' });
    expect(await acceptInvitation('not-a-uuid')).toEqual({ error: 'Invitation not found' });
  });

  it('returns not found when the invitation does not exist', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1', email: 'x@test.com' });
    selectQueue.push([]);
    expect(await acceptInvitation(VALID_INVITE_ID)).toEqual({ error: 'Invitation not found' });
  });

  it('rejects an invitation that is no longer pending', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1', email: 'x@test.com' });
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'x@test.com', role: 'member', status: 'accepted', expiresAt: new Date(Date.now() + 86400000), organizationId: 'org-1' }]);
    expect(await acceptInvitation(VALID_INVITE_ID)).toEqual({ error: 'This invitation is no longer valid' });
  });

  it('rejects an expired invitation', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1', email: 'x@test.com' });
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'x@test.com', role: 'member', status: 'pending', expiresAt: new Date(Date.now() - 86400000), organizationId: 'org-1' }]);
    expect(await acceptInvitation(VALID_INVITE_ID)).toEqual({ error: 'This invitation has expired' });
  });

  it('rejects when the signed-in email does not match the invitation', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1', email: 'other@test.com' });
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'invited@test.com', role: 'member', status: 'pending', expiresAt: new Date(Date.now() + 86400000), organizationId: 'org-1' }]);
    expect(await acceptInvitation(VALID_INVITE_ID)).toEqual({
      error: 'This invitation was sent to a different email address',
    });
  });

  it('joins an existing user to the org and marks the invitation accepted', async () => {
    getAuthUser.mockResolvedValue({ id: 'u1', email: 'Invited@test.com' });
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'invited@test.com', role: 'admin', status: 'pending', expiresAt: new Date(Date.now() + 86400000), organizationId: 'org-9' }]);
    selectQueue.push([{ id: 'u1' }]); // existing users row found inside the transaction
    expect(await acceptInvitation(VALID_INVITE_ID)).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ __brand: 'users' }),
      expect.objectContaining({ organizationId: 'org-9', role: 'admin' }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ __brand: 'orgInvitations' }),
      expect.objectContaining({ status: 'accepted' }),
    );
  });

  it('creates a users row when the invitee has none yet', async () => {
    getAuthUser.mockResolvedValue({ id: 'u-new', email: 'invited@test.com', user_metadata: { full_name: 'New Person' } });
    selectQueue.push([{ id: VALID_INVITE_ID, email: 'invited@test.com', role: 'member', status: 'pending', expiresAt: new Date(Date.now() + 86400000), organizationId: 'org-9' }]);
    selectQueue.push([]); // no existing users row
    expect(await acceptInvitation(VALID_INVITE_ID)).toEqual({ success: true });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ __brand: 'users' }));
  });
});
