'use server';

import { db } from '@/lib/db';
import { buildings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAuthContext, assertBuildingAccess, WRITE_ROLES } from '@/lib/auth/helpers';
import { checkBuildingLimit } from '@/lib/billing/feature-gate';
import { actionLimiter } from '@/lib/rate-limit';
import { buildingFormSchema, type BuildingFormValues } from '@/components/buildings/building-form';

export async function createBuilding(data: BuildingFormValues) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  // Rate limit
  const { success: rlOk } = await actionLimiter.check(10, 'action:building:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  // Validate
  const validated = buildingFormSchema.safeParse(data);
  if (!validated.success) return { error: 'Validation failed' };

  // Role check — must be owner or admin to create buildings
  if (!WRITE_ROLES.includes(ctx.role)) {
    return { error: 'Only owners and admins can add buildings' };
  }

  // Enforce building limit
  const limit = await checkBuildingLimit(ctx.orgId);
  if (!limit.allowed) {
    return {
      error: `Building limit reached (${limit.current}/${limit.limit}). Upgrade your plan to add more buildings.`,
    };
  }

  try {
    const [building] = await db.insert(buildings).values({
      organizationId: ctx.orgId,
      name: data.name,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      city: data.city,
      state: data.state.toUpperCase(),
      zip: data.zip,
      borough: data.borough || null,
      bbl: data.bbl || null,
      bin: data.bin || null,
      grossSqft: data.grossSqft,
      yearBuilt: data.yearBuilt ? parseInt(data.yearBuilt, 10) : null,
      occupancyType: data.occupancyType,
      jurisdictionId: data.jurisdictionId,
      notes: data.notes || null,
    }).returning();

    revalidatePath('/buildings');
    revalidatePath('/dashboard');
    return { success: true, building };
  } catch (error) {
    console.error('Failed to create building:', error);
    return { error: 'Failed to create building' };
  }
}

export async function updateBuilding(buildingId: string, data: BuildingFormValues) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  // Rate limit
  const { success: rlOk } = await actionLimiter.check(10, 'action:building:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  // Validate
  const validated = buildingFormSchema.safeParse(data);
  if (!validated.success) return { error: 'Validation failed' };

  // Verify ownership + write permission
  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Unauthorized' };

  try {
    const [building] = await db.update(buildings).set({
      name: data.name,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      city: data.city,
      state: data.state.toUpperCase(),
      zip: data.zip,
      borough: data.borough || null,
      bbl: data.bbl || null,
      bin: data.bin || null,
      grossSqft: data.grossSqft,
      yearBuilt: data.yearBuilt ? parseInt(data.yearBuilt, 10) : null,
      occupancyType: data.occupancyType,
      jurisdictionId: data.jurisdictionId,
      notes: data.notes || null,
      updatedAt: new Date(),
    }).where(eq(buildings.id, buildingId)).returning();

    revalidatePath('/buildings');
    revalidatePath('/buildings/' + buildingId);
    revalidatePath('/dashboard');
    return { success: true, building };
  } catch (error) {
    console.error('Failed to update building:', error);
    return { error: 'Failed to update building' };
  }
}

export async function deleteBuilding(buildingId: string) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  const { success: rlOk } = await actionLimiter.check(10, 'action:building:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Unauthorized' };

  try {
    await db.delete(buildings).where(eq(buildings.id, buildingId));

    revalidatePath('/buildings');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete building:', error);
    return { error: 'Failed to delete building' };
  }
}
