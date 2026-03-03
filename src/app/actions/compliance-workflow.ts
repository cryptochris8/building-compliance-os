'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { complianceYears, complianceActivities, buildings, users } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { calculateBuildingCompliance } from '@/lib/emissions/compliance-service';

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getUserOrgId(): Promise<string | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;
  const [dbUser] = await db.select({ organizationId: users.organizationId })
    .from(users).where(eq(users.id, authUser.id)).limit(1);
  return dbUser?.organizationId || null;
}

async function logActivity(
  buildingId: string,
  complianceYearId: string | null,
  activityType: 'note' | 'status_change' | 'calculation' | 'document_upload' | 'checklist_update' | 'lock_change' | 'deduction_change',
  description: string,
  metadata?: Record<string, unknown>
) {
  const user = await getAuthUser();
  const orgId = await getUserOrgId();
  await db.insert(complianceActivities).values({
    buildingId,
    complianceYearId,
    orgId,
    activityType,
    description,
    actorId: user?.id,
    metadata: metadata || null,
  });
}

export async function updateChecklist(
  buildingId: string,
  year: number,
  checklistState: Record<string, boolean | string>
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

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

  await logActivity(buildingId, cy.id, 'checklist_update', 'Checklist updated for ' + year, checklistState);
  revalidatePath('/buildings/' + buildingId + '/compliance');
  return {};
}

export async function lockComplianceYear(
  buildingId: string,
  year: number
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  if (!cy) return { error: 'Compliance year not found' };

  await db.update(complianceYears).set({
    locked: true,
    lockedAt: new Date(),
    lockedBy: user.id,
    updatedAt: new Date(),
  }).where(eq(complianceYears.id, cy.id));

  await logActivity(buildingId, cy.id, 'lock_change', 'Compliance year ' + year + ' locked');
  revalidatePath('/buildings/' + buildingId + '/compliance');
  return {};
}

export async function unlockComplianceYear(
  buildingId: string,
  year: number,
  reason: string
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  if (!cy) return { error: 'Compliance year not found' };

  await db.update(complianceYears).set({
    locked: false,
    lockReason: reason,
    updatedAt: new Date(),
  }).where(eq(complianceYears.id, cy.id));

  await logActivity(buildingId, cy.id, 'lock_change', 'Compliance year ' + year + ' unlocked. Reason: ' + reason);
  revalidatePath('/buildings/' + buildingId + '/compliance');
  return {};
}

export async function addComplianceNote(
  buildingId: string,
  year: number,
  content: string
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  const [cy] = await db.select({ id: complianceYears.id }).from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  await logActivity(buildingId, cy?.id || null, 'note', content);
  revalidatePath('/buildings/' + buildingId + '/compliance');
  return {};
}

export async function bulkMarkSubmitted(
  buildingIds: string[],
  year: number
): Promise<{ error?: string; successCount?: number }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  let successCount = 0;
  for (const buildingId of buildingIds) {
    const [cy] = await db.select().from(complianceYears)
      .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
      .limit(1);

    if (cy && !cy.locked) {
      await db.update(complianceYears).set({
        reportSubmitted: true,
        reportSubmittedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(complianceYears.id, cy.id));
      await logActivity(buildingId, cy.id, 'status_change', 'Report marked as submitted (bulk action)');
      successCount++;
    }
  }

  revalidatePath('/compliance');
  return { successCount };
}

export async function bulkRecalculate(
  buildingIds: string[],
  year: number
): Promise<{ error?: string; successCount?: number }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  let successCount = 0;
  for (const buildingId of buildingIds) {
    const [cy] = await db.select().from(complianceYears)
      .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
      .limit(1);

    if (cy?.locked) continue;

    try {
      await calculateBuildingCompliance(buildingId, year);
      await logActivity(buildingId, cy?.id || null, 'calculation', 'Emissions recalculated (bulk action)');
      successCount++;
    } catch {
      // Skip failures
    }
  }

  revalidatePath('/compliance');
  return { successCount };
}

export async function getComplianceActivities(
  buildingId: string,
  year?: number
) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized', data: [] };

  let cyId: string | undefined;
  if (year) {
    const [cy] = await db.select({ id: complianceYears.id }).from(complianceYears)
      .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
      .limit(1);
    cyId = cy?.id;
  }

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
