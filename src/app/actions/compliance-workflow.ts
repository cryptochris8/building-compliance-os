'use server';

import { db } from '@/lib/db';
import { complianceYears, complianceActivities } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { calculateBuildingCompliance } from '@/lib/emissions/compliance-service';
import { getAuthUser, assertBuildingAccess, getAuthContext, filterAuthorizedBuildingIds, assertRole, type UserRole } from '@/lib/auth/helpers';

const WRITE_ROLES: UserRole[] = ['owner', 'admin'];

async function logActivity(
  buildingId: string,
  complianceYearId: string | null,
  activityType: 'note' | 'status_change' | 'calculation' | 'document_upload' | 'checklist_update' | 'lock_change' | 'deduction_change',
  description: string,
  actorId: string,
  orgId: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(complianceActivities).values({
    buildingId,
    complianceYearId,
    orgId,
    activityType,
    description,
    actorId,
    metadata: metadata || null,
  });
}

export async function updateChecklist(
  buildingId: string,
  year: number,
  checklistState: Record<string, boolean | string>
): Promise<{ error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  if (!cy) return { error: 'Compliance year not found' };
  if (cy.locked) return { error: 'Compliance year is locked' };

  await db.update(complianceYears).set({
    checklistState,
    updatedAt: new Date(),
  }).where(eq(complianceYears.id, cy.id));

  // If report_submitted is in checklist, update the dedicated field too
  if ('report_submitted' in checklistState) {
    await db.update(complianceYears).set({
      reportSubmitted: !!checklistState.report_submitted,
      reportSubmittedAt: checklistState.report_submitted ? new Date() : null,
    }).where(eq(complianceYears.id, cy.id));
  }

  await logActivity(buildingId, cy.id, 'checklist_update', 'Checklist updated for ' + year, ctx.user.id, access.orgId, checklistState);
  revalidatePath('/buildings/' + buildingId + '/compliance');
  revalidateTag('portfolio-summary-' + access.orgId + '-' + year, 'max');
  return {};
}

export async function lockComplianceYear(
  buildingId: string,
  year: number
): Promise<{ error?: string }> {
  const ctx = await assertRole('owner', 'admin');
  if (!ctx) return { error: 'Unauthorized: owner or admin role required' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  if (!cy) return { error: 'Compliance year not found' };

  await db.update(complianceYears).set({
    locked: true,
    lockedAt: new Date(),
    lockedBy: ctx.user.id,
    updatedAt: new Date(),
  }).where(eq(complianceYears.id, cy.id));

  await logActivity(buildingId, cy.id, 'lock_change', 'Compliance year ' + year + ' locked', ctx.user.id, access.orgId);
  revalidatePath('/buildings/' + buildingId + '/compliance');
  revalidateTag('portfolio-summary-' + access.orgId + '-' + year, 'max');
  return {};
}

export async function unlockComplianceYear(
  buildingId: string,
  year: number,
  reason: string
): Promise<{ error?: string }> {
  const ctx = await assertRole('owner', 'admin');
  if (!ctx) return { error: 'Unauthorized: owner or admin role required' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  if (!cy) return { error: 'Compliance year not found' };

  await db.update(complianceYears).set({
    locked: false,
    lockReason: reason,
    updatedAt: new Date(),
  }).where(eq(complianceYears.id, cy.id));

  await logActivity(buildingId, cy.id, 'lock_change', 'Compliance year ' + year + ' unlocked. Reason: ' + reason, ctx.user.id, access.orgId);
  revalidatePath('/buildings/' + buildingId + '/compliance');
  revalidateTag('portfolio-summary-' + access.orgId + '-' + year, 'max');
  return {};
}

export async function addComplianceNote(
  buildingId: string,
  year: number,
  content: string
): Promise<{ error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  const [cy] = await db.select({ id: complianceYears.id }).from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  await logActivity(buildingId, cy?.id || null, 'note', content, ctx.user.id, access.orgId);
  revalidatePath('/buildings/' + buildingId + '/compliance');
  return {};
}

export async function bulkMarkSubmitted(
  buildingIds: string[],
  year: number
): Promise<{ error?: string; successCount?: number }> {
  // Verify all building IDs belong to the user's org
  const auth = await filterAuthorizedBuildingIds(buildingIds);
  if (!auth) return { error: 'Unauthorized' };

  if (auth.authorizedIds.length === 0) {
    revalidatePath('/compliance');
    return { successCount: 0 };
  }

  // Batch query: fetch all compliance years for authorized buildings in one query
  const allCy = await db.select().from(complianceYears)
    .where(and(
      inArray(complianceYears.buildingId, auth.authorizedIds),
      eq(complianceYears.year, year)
    ));

  const updatableIds = allCy.filter(cy => !cy.locked).map(cy => cy.id);

  let successCount = 0;
  if (updatableIds.length > 0) {
    await db.update(complianceYears).set({
      reportSubmitted: true,
      reportSubmittedAt: new Date(),
      updatedAt: new Date(),
    }).where(inArray(complianceYears.id, updatableIds));
    successCount = updatableIds.length;
  }

  revalidatePath('/compliance');
  return { successCount };
}

export async function bulkRecalculate(
  buildingIds: string[],
  year: number
): Promise<{ error?: string; successCount?: number }> {
  // Verify all building IDs belong to the user's org
  const auth = await filterAuthorizedBuildingIds(buildingIds);
  if (!auth) return { error: 'Unauthorized' };

  if (auth.authorizedIds.length === 0) {
    revalidatePath('/compliance');
    return { successCount: 0 };
  }

  // Batch query to find locked buildings, then only recalculate unlocked ones
  const lockedCy = await db.select({ buildingId: complianceYears.buildingId })
    .from(complianceYears)
    .where(and(
      inArray(complianceYears.buildingId, auth.authorizedIds),
      eq(complianceYears.year, year),
      eq(complianceYears.locked, true)
    ));
  const lockedIds = new Set(lockedCy.map(cy => cy.buildingId));

  let successCount = 0;
  for (const buildingId of auth.authorizedIds) {
    if (lockedIds.has(buildingId)) continue;
    try {
      await calculateBuildingCompliance(buildingId, year);
      successCount++;
    } catch (err) {
      console.error('Failed to recalculate building ' + buildingId + ':', err instanceof Error ? err.message : err);
    }
  }

  revalidatePath('/compliance');
  return { successCount };
}

export async function getComplianceActivities(
  buildingId: string
) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized', data: [] };

  // Verify building ownership
  const access = await assertBuildingAccess(buildingId);
  if (!access) return { error: 'Building not found or access denied', data: [] };

  const activities = await db.select({
    id: complianceActivities.id,
    activityType: complianceActivities.activityType,
    description: complianceActivities.description,
    metadata: complianceActivities.metadata,
    createdAt: complianceActivities.createdAt,
    actorId: complianceActivities.actorId,
  }).from(complianceActivities)
    .where(eq(complianceActivities.buildingId, buildingId))
    .orderBy(complianceActivities.createdAt);

  return { data: activities };
}
