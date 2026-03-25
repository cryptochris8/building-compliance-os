import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users, buildings } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export type UserRole = 'owner' | 'admin' | 'member';

/**
 * Get the authenticated Supabase user, or null if not logged in.
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the authenticated user's organization ID.
 * Returns null if not logged in or user has no org.
 */
export async function getUserOrgId(): Promise<string | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;
  const [dbUser] = await db.select({ organizationId: users.organizationId })
    .from(users).where(eq(users.id, authUser.id)).limit(1);
  return dbUser?.organizationId || null;
}

/**
 * Require authentication. Returns the user or throws.
 */
export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

/**
 * Get auth user + org ID + role in a single flow (avoids double auth call).
 */
export async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [dbUser] = await db.select({ organizationId: users.organizationId, role: users.role })
    .from(users).where(eq(users.id, user.id)).limit(1);

  if (!dbUser?.organizationId) return null;

  return { user, orgId: dbUser.organizationId, role: (dbUser.role || 'member') as UserRole };
}

/**
 * Assert the current user has one of the required roles.
 * Returns the auth context on success, or null if insufficient permissions.
 */
export async function assertRole(...allowedRoles: UserRole[]): Promise<{ user: { id: string }; orgId: string; role: UserRole } | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!allowedRoles.includes(ctx.role)) return null;
  return ctx;
}

/**
 * Verify that the given building belongs to the user's organization.
 * Optionally checks that the user has one of the required roles.
 * Returns the orgId and role on success, or null if access is denied.
 */
export async function assertBuildingAccess(
  buildingId: string,
  requiredRoles?: UserRole[]
): Promise<{ orgId: string; role: UserRole } | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  if (requiredRoles && !requiredRoles.includes(ctx.role)) return null;

  const [building] = await db.select({ organizationId: buildings.organizationId })
    .from(buildings).where(eq(buildings.id, buildingId)).limit(1);

  if (!building || building.organizationId !== ctx.orgId) return null;

  return { orgId: ctx.orgId, role: ctx.role };
}

/**
 * Verify multiple building IDs belong to the user's org.
 * Returns only the building IDs that belong to the org.
 */
/**
 * Standard write roles required for mutating operations.
 */
export const WRITE_ROLES: UserRole[] = ['owner', 'admin'];

/**
 * Get auth context with Stripe billing information.
 * Extends getAuthContext with org-level Stripe fields.
 */
export async function getAuthContextWithBilling() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { organizations } = await import('@/lib/db/schema');
  const [org] = await db.select({
    stripeCustomerId: organizations.stripeCustomerId,
    subscriptionTier: organizations.subscriptionTier,
  }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);

  return {
    ...ctx,
    email: ctx.user.email ?? '',
    stripeCustomerId: org?.stripeCustomerId ?? null,
    tier: (org?.subscriptionTier as string) ?? 'free',
  };
}

export async function filterAuthorizedBuildingIds(buildingIds: string[]): Promise<{ orgId: string; authorizedIds: string[] } | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  if (buildingIds.length === 0) return { orgId: ctx.orgId, authorizedIds: [] };

  const ownedBuildings = await db.select({ id: buildings.id })
    .from(buildings)
    .where(and(
      inArray(buildings.id, buildingIds),
      eq(buildings.organizationId, ctx.orgId)
    ));

  return {
    orgId: ctx.orgId,
    authorizedIds: ownedBuildings.map(b => b.id),
  };
}
