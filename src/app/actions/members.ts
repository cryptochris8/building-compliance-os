'use server';

import { db } from '@/lib/db';
import { users, orgInvitations, organizations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAuthContext, getAuthUser, WRITE_ROLES, type UserRole } from '@/lib/auth/helpers';
import { actionLimiter } from '@/lib/rate-limit';
import { z } from 'zod';
import { sanitizeErrorMessage } from '@/lib/utils/error';
import { sendInvitationEmail } from '@/lib/email/invitation';

const inviteSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(['admin', 'member']),
});

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member']),
});

export async function getOrgMembers() {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  const members = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.organizationId, ctx.orgId));

  return { members };
}

export async function getOrgInvitations() {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  if (!WRITE_ROLES.includes(ctx.role)) {
    return { error: 'Only owners and admins can view invitations' };
  }

  const invitations = await db
    .select({
      id: orgInvitations.id,
      email: orgInvitations.email,
      role: orgInvitations.role,
      status: orgInvitations.status,
      expiresAt: orgInvitations.expiresAt,
      createdAt: orgInvitations.createdAt,
    })
    .from(orgInvitations)
    .where(
      and(
        eq(orgInvitations.organizationId, ctx.orgId),
        eq(orgInvitations.status, 'pending')
      )
    );

  return { invitations };
}

export async function inviteMember(data: { email: string; role: string }) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  const { success: rlOk } = await actionLimiter.check(10, 'action:invite:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  if (!WRITE_ROLES.includes(ctx.role)) {
    return { error: 'Only owners and admins can invite members' };
  }

  const validated = inviteSchema.safeParse(data);
  if (!validated.success) return { error: 'Invalid email or role' };

  const { email, role } = validated.data;

  try {
    // Check if user is already a member
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), eq(users.organizationId, ctx.orgId)))
      .limit(1);

    if (existing) return { error: 'This user is already a member of your organization' };

    // Check for existing pending invitation
    const [existingInvite] = await db
      .select({ id: orgInvitations.id })
      .from(orgInvitations)
      .where(
        and(
          eq(orgInvitations.email, email),
          eq(orgInvitations.organizationId, ctx.orgId),
          eq(orgInvitations.status, 'pending')
        )
      )
      .limit(1);

    if (existingInvite) return { error: 'An invitation is already pending for this email' };

    // Create invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [invitation] = await db.insert(orgInvitations).values({
      organizationId: ctx.orgId,
      email,
      role: role as 'admin' | 'member',
      invitedBy: ctx.user.id,
      expiresAt,
    }).returning();

    // Send the invitation email. Best-effort: the invitation row is the
    // source of truth, so a mail failure does not fail the whole action —
    // it is reported back via emailSent so the UI can warn.
    let emailSent = true;
    try {
      const [org] = await db.select({ name: organizations.name })
        .from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
      const [inviter] = await db.select({ fullName: users.fullName })
        .from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      await sendInvitationEmail({
        to: email,
        orgName: org?.name ?? 'an organization',
        inviterName: inviter?.fullName || ctx.user.email || 'A teammate',
        role,
        acceptUrl: `${appUrl}/invite/${invitation.id}`,
        expiresAt,
      });
    } catch (err) {
      emailSent = false;
      console.error('Failed to send invitation email:', err instanceof Error ? err.message : err);
    }

    revalidatePath('/settings');
    return { success: true, invitation, emailSent };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'An unexpected error occurred') };
  }
}

export async function cancelInvitation(invitationId: string) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  const { success: rlOk } = await actionLimiter.check(10, 'action:member:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  if (!WRITE_ROLES.includes(ctx.role)) {
    return { error: 'Only owners and admins can cancel invitations' };
  }

  try {
    const [invitation] = await db
      .select({ organizationId: orgInvitations.organizationId })
      .from(orgInvitations)
      .where(and(eq(orgInvitations.id, invitationId), eq(orgInvitations.status, 'pending')))
      .limit(1);

    if (!invitation || invitation.organizationId !== ctx.orgId) {
      return { error: 'Invitation not found' };
    }

    await db
      .update(orgInvitations)
      .set({ status: 'canceled' })
      .where(eq(orgInvitations.id, invitationId));

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'An unexpected error occurred') };
  }
}

export async function updateMemberRole(data: { userId: string; role: string }) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  const { success: rlOk } = await actionLimiter.check(10, 'action:member:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  if (ctx.role !== 'owner') {
    return { error: 'Only the organization owner can change roles' };
  }

  const validated = roleSchema.safeParse(data);
  if (!validated.success) return { error: 'Invalid user ID or role' };

  const { userId, role } = validated.data;

  if (userId === ctx.user.id) {
    return { error: 'You cannot change your own role' };
  }

  try {
    const [target] = await db
      .select({ organizationId: users.organizationId, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!target || target.organizationId !== ctx.orgId) {
      return { error: 'User not found in your organization' };
    }

    if (target.role === 'owner') {
      return { error: 'Cannot change the owner role' };
    }

    await db
      .update(users)
      .set({ role: role as UserRole })
      .where(eq(users.id, userId));

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'An unexpected error occurred') };
  }
}

export async function removeMember(userId: string) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  const { success: rlOk } = await actionLimiter.check(10, 'action:member:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  if (!WRITE_ROLES.includes(ctx.role)) {
    return { error: 'Only owners and admins can remove members' };
  }

  if (userId === ctx.user.id) {
    return { error: 'You cannot remove yourself from the organization' };
  }

  try {
    const [target] = await db
      .select({ organizationId: users.organizationId, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!target || target.organizationId !== ctx.orgId) {
      return { error: 'User not found in your organization' };
    }

    if (target.role === 'owner') {
      return { error: 'Cannot remove the organization owner' };
    }

    // Remove user from org by setting organizationId to null
    await db
      .update(users)
      .set({ organizationId: null, role: 'member' })
      .where(eq(users.id, userId));

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'An unexpected error occurred') };
  }
}

/**
 * Read an invitation for the public /invite/[id] accept page. Returns a
 * coarse `state` so the page can render the right message without exposing
 * more than the org name and the invited address.
 */
export async function getInvitationForAccept(invitationId: string) {
  const idCheck = z.string().uuid().safeParse(invitationId);
  if (!idCheck.success) return { error: 'not_found' as const };

  const [invitation] = await db
    .select({
      id: orgInvitations.id,
      email: orgInvitations.email,
      role: orgInvitations.role,
      status: orgInvitations.status,
      expiresAt: orgInvitations.expiresAt,
      organizationId: orgInvitations.organizationId,
    })
    .from(orgInvitations)
    .where(eq(orgInvitations.id, invitationId))
    .limit(1);

  if (!invitation) return { error: 'not_found' as const };

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invitation.organizationId))
    .limit(1);

  const expired = new Date(invitation.expiresAt) < new Date();
  const state: 'pending' | 'expired' | 'accepted' | 'canceled' =
    invitation.status !== 'pending'
      ? (invitation.status as 'accepted' | 'canceled' | 'expired')
      : expired
        ? 'expired'
        : 'pending';

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      orgName: org?.name ?? 'an organization',
      state,
    },
  };
}

/**
 * Accept an organization invitation. The signed-in user's email must match
 * the address the invitation was sent to. Joins them to the org (creating
 * their users row if they signed up fresh) and marks the invite accepted.
 */
export async function acceptInvitation(invitationId: string) {
  const user = await getAuthUser();
  if (!user) return { error: 'You must be signed in to accept an invitation' };

  const idCheck = z.string().uuid().safeParse(invitationId);
  if (!idCheck.success) return { error: 'Invitation not found' };

  try {
    const [invitation] = await db
      .select()
      .from(orgInvitations)
      .where(eq(orgInvitations.id, invitationId))
      .limit(1);

    if (!invitation) return { error: 'Invitation not found' };
    if (invitation.status !== 'pending') {
      return { error: 'This invitation is no longer valid' };
    }
    if (new Date(invitation.expiresAt) < new Date()) {
      return { error: 'This invitation has expired' };
    }
    if ((user.email ?? '').toLowerCase() !== invitation.email.toLowerCase()) {
      return { error: 'This invitation was sent to a different email address' };
    }

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (existing) {
        await tx
          .update(users)
          .set({ organizationId: invitation.organizationId, role: invitation.role })
          .where(eq(users.id, user.id));
      } else {
        await tx.insert(users).values({
          id: user.id,
          email: user.email ?? invitation.email,
          fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
          organizationId: invitation.organizationId,
          role: invitation.role,
        });
      }

      await tx
        .update(orgInvitations)
        .set({ status: 'accepted' })
        .where(eq(orgInvitations.id, invitationId));
    });

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'Failed to accept invitation') };
  }
}
