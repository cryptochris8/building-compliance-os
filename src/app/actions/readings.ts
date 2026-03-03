'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { utilityReadings, complianceYears } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { triggerRecalculation } from '@/lib/emissions/recalculation';

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

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function isYearLocked(buildingId: string, year: number): Promise<boolean> {
  const [cy] = await db.select({ locked: complianceYears.locked }).from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);
  return cy?.locked === true;
}

export async function createReading(formData: ReadingFormValues) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  const validated = readingFormSchema.safeParse(formData);
  if (!validated.success) return { error: 'Validation failed', details: validated.error.flatten() };
  const data = validated.data;

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
    return { success: true, reading };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create reading' };
  }
}

export async function updateReading(id: string, formData: ReadingFormValues) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  const validated = readingFormSchema.safeParse(formData);
  if (!validated.success) return { error: 'Validation failed', details: validated.error.flatten() };
  const data = validated.data;

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
    }).where(eq(utilityReadings.id, id)).returning();

    await triggerRecalculation(data.buildingId).catch(console.error);
    revalidatePath('/buildings/' + data.buildingId + '/readings');
    revalidatePath('/buildings/' + data.buildingId + '/compliance');
    return { success: true, reading };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update reading' };
  }
}

export async function deleteReading(id: string, buildingId: string) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  // Check if reading belongs to a locked year
  const [reading] = await db.select({ periodStart: utilityReadings.periodStart })
    .from(utilityReadings).where(eq(utilityReadings.id, id)).limit(1);
  if (reading) {
    const year = new Date(reading.periodStart).getFullYear();
    if (await isYearLocked(buildingId, year)) {
      return { error: 'Compliance year ' + year + ' is locked. Unlock it before deleting readings.' };
    }
  }

  try {
    await db.delete(utilityReadings).where(eq(utilityReadings.id, id));
    await triggerRecalculation(buildingId).catch(console.error);
    revalidatePath('/buildings/' + buildingId + '/readings');
    revalidatePath('/buildings/' + buildingId + '/compliance');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to delete reading' };
  }
}
