'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { utilityReadings, utilityAccounts, complianceYears } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { triggerRecalculation } from '@/lib/emissions/recalculation';
import { getAuthUser, assertBuildingAccess, WRITE_ROLES } from '@/lib/auth/helpers';
import { actionLimiter } from '@/lib/rate-limit';
import { sanitizeErrorMessage } from '@/lib/utils/error';

export const readingFormSchema = z.object({
  utilityAccountId: z.string().min(1, 'Utility account is required'),
  buildingId: z.string().min(1, 'Building ID is required'),
  periodMonth: z.number().min(1).max(12, 'Month must be 1-12'),
  periodYear: z.number().min(2000).max(2100, 'Enter a valid year'),
  consumptionValue: z
    .string()
    .min(1, 'Consumption value is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: 'Must be a non-negative number',
    }),
  consumptionUnit: z.enum(['kwh', 'therms', 'kbtu', 'gallons'], {
    error: 'Unit is required',
  }),
  costDollars: z
    .string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), {
      message: 'Must be a non-negative number',
    }),
  source: z.enum(['manual', 'csv_upload', 'portfolio_manager', 'green_button']),
  confidence: z.enum(['confirmed', 'estimated', 'flagged']),
});

export type ReadingFormValues = z.infer<typeof readingFormSchema>;

async function isYearLocked(buildingId: string, year: number): Promise<boolean> {
  const [cy] = await db.select({ locked: complianceYears.locked }).from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);
  return cy?.locked === true;
}

export async function createReading(formData: ReadingFormValues) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  const { success: rlOk } = await actionLimiter.check(20, 'action:reading:' + user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  const validated = readingFormSchema.safeParse(formData);
  if (!validated.success) return { error: 'Validation failed', details: validated.error.flatten() };
  const data = validated.data;

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(data.buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  // Verify utilityAccountId belongs to this building
  const [account] = await db.select({ id: utilityAccounts.id })
    .from(utilityAccounts)
    .where(and(eq(utilityAccounts.id, data.utilityAccountId), eq(utilityAccounts.buildingId, data.buildingId)))
    .limit(1);
  if (!account) return { error: 'Utility account not found or does not belong to this building' };

  // Check locked year
  if (await isYearLocked(data.buildingId, data.periodYear)) {
    return { error: 'Compliance year ' + data.periodYear + ' is locked. Unlock it before adding readings.' };
  }

  const periodStart = data.periodYear + '-' + String(data.periodMonth).padStart(2, '0') + '-01';
  const lastDay = new Date(data.periodYear, data.periodMonth, 0).getDate();
  const periodEnd = data.periodYear + '-' + String(data.periodMonth).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

  try {
    const [reading] = await db.insert(utilityReadings).values({
      utilityAccountId: data.utilityAccountId,
      buildingId: data.buildingId,
      periodStart, periodEnd,
      consumptionValue: data.consumptionValue,
      consumptionUnit: data.consumptionUnit,
      costDollars: data.costDollars || null,
      source: data.source,
      confidence: data.confidence,
    }).returning();

    await triggerRecalculation(data.buildingId).catch(console.error);
    revalidatePath('/buildings/' + data.buildingId + '/readings');
    revalidatePath('/buildings/' + data.buildingId + '/compliance');
    if (access) revalidateTag('portfolio-summary-' + access.orgId + '-' + data.periodYear, 'max');
    return { success: true, reading };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'Failed to create reading') };
  }
}

export async function updateReading(id: string, formData: ReadingFormValues) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  const validated = readingFormSchema.safeParse(formData);
  if (!validated.success) return { error: 'Validation failed', details: validated.error.flatten() };
  const data = validated.data;

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(data.buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  // Verify utilityAccountId belongs to this building
  const [account] = await db.select({ id: utilityAccounts.id })
    .from(utilityAccounts)
    .where(and(eq(utilityAccounts.id, data.utilityAccountId), eq(utilityAccounts.buildingId, data.buildingId)))
    .limit(1);
  if (!account) return { error: 'Utility account not found or does not belong to this building' };

  if (await isYearLocked(data.buildingId, data.periodYear)) {
    return { error: 'Compliance year ' + data.periodYear + ' is locked. Unlock it before editing readings.' };
  }

  const periodStart = data.periodYear + '-' + String(data.periodMonth).padStart(2, '0') + '-01';
  const lastDay = new Date(data.periodYear, data.periodMonth, 0).getDate();
  const periodEnd = data.periodYear + '-' + String(data.periodMonth).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

  try {
    const [reading] = await db.update(utilityReadings).set({
      utilityAccountId: data.utilityAccountId,
      periodStart, periodEnd,
      consumptionValue: data.consumptionValue,
      consumptionUnit: data.consumptionUnit,
      costDollars: data.costDollars || null,
      source: data.source,
      confidence: data.confidence,
    }).where(and(eq(utilityReadings.id, id), eq(utilityReadings.buildingId, data.buildingId))).returning();

    await triggerRecalculation(data.buildingId).catch(console.error);
    revalidatePath('/buildings/' + data.buildingId + '/readings');
    revalidatePath('/buildings/' + data.buildingId + '/compliance');
    if (access) revalidateTag('portfolio-summary-' + access.orgId + '-' + data.periodYear, 'max');
    return { success: true, reading };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'Failed to update reading') };
  }
}

export async function deleteReading(id: string, buildingId: string) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  // Verify record belongs to this building and check locked year
  const [reading] = await db.select({ periodStart: utilityReadings.periodStart })
    .from(utilityReadings).where(and(eq(utilityReadings.id, id), eq(utilityReadings.buildingId, buildingId))).limit(1);
  if (!reading) return { error: 'Reading not found or access denied' };
  const year = new Date(reading.periodStart).getFullYear();
  if (await isYearLocked(buildingId, year)) {
    return { error: 'Compliance year ' + year + ' is locked. Unlock it before deleting readings.' };
  }

  try {
    await db.delete(utilityReadings).where(and(eq(utilityReadings.id, id), eq(utilityReadings.buildingId, buildingId)));
    await triggerRecalculation(buildingId).catch(console.error);
    revalidatePath('/buildings/' + buildingId + '/readings');
    revalidatePath('/buildings/' + buildingId + '/compliance');
    if (access) {
      revalidateTag('portfolio-summary-' + access.orgId + '-' + year, 'max');
    }
    return { success: true };
  } catch (error) {
    return { error: sanitizeErrorMessage(error, 'Failed to delete reading') };
  }
}
