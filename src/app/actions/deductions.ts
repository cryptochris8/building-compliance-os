'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { deductions, complianceYears, complianceActivities } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getAuthUser, assertBuildingAccess, getAuthContext, WRITE_ROLES } from '@/lib/auth/helpers';
import { actionLimiter } from '@/lib/rate-limit';

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function updateDeductionTotals(complianceYearId: string, tx: TxClient) {
  const allDeductions = await tx.select({ amountTco2e: deductions.amountTco2e })
    .from(deductions).where(eq(deductions.complianceYearId, complianceYearId));
  const totalDeductions = allDeductions.reduce((sum, d) => sum + Number(d.amountTco2e || 0), 0);

  const [cy] = await tx.select({ totalEmissionsTco2e: complianceYears.totalEmissionsTco2e })
    .from(complianceYears).where(eq(complianceYears.id, complianceYearId)).limit(1);
  const grossEmissions = Number(cy?.totalEmissionsTco2e || 0);
  const netEmissions = Math.max(0, grossEmissions - totalDeductions);

  await tx.update(complianceYears).set({
    totalDeductionsTco2e: String(Math.round(totalDeductions * 1000) / 1000),
    netEmissionsTco2e: String(Math.round(netEmissions * 1000) / 1000),
    updatedAt: new Date(),
  }).where(eq(complianceYears.id, complianceYearId));
}

export const deductionFormSchema = z.object({
  buildingId: z.string().min(1),
  complianceYearId: z.string().min(1),
  deductionType: z.enum(['purchased_recs', 'onsite_renewables', 'community_dg', 'other']),
  description: z.string().optional(),
  amountTco2e: z.string().refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Must be positive'),
  documentationId: z.string().optional(),
});

export type DeductionFormValues = z.infer<typeof deductionFormSchema>;

export async function createDeduction(data: DeductionFormValues) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  const { success: rlOk } = await actionLimiter.check(20, 'action:deduction:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  // Validate input first
  const validated = deductionFormSchema.safeParse(data);
  if (!validated.success) return { error: 'Validation failed' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(data.buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  // Check if compliance year is locked
  const [cy] = await db.select().from(complianceYears)
    .where(eq(complianceYears.id, data.complianceYearId)).limit(1);
  if (cy?.locked) return { error: 'Compliance year is locked' };

  try {
    const deduction = await db.transaction(async (tx) => {
      const [newDeduction] = await tx.insert(deductions).values({
        buildingId: data.buildingId,
        complianceYearId: data.complianceYearId,
        orgId: access.orgId,
        deductionType: data.deductionType,
        description: data.description || null,
        amountTco2e: data.amountTco2e,
        documentationId: data.documentationId || null,
      }).returning();

      await updateDeductionTotals(data.complianceYearId, tx);

      await tx.insert(complianceActivities).values({
        buildingId: data.buildingId,
        complianceYearId: data.complianceYearId,
        orgId: access.orgId,
        activityType: 'deduction_change',
        description: 'Added deduction: ' + data.deductionType + ' (' + data.amountTco2e + ' tCO2e)',
        actorId: ctx.user.id,
      });

      return newDeduction;
    });

    revalidatePath('/buildings/' + data.buildingId + '/deductions');
    revalidatePath('/buildings/' + data.buildingId + '/compliance');
    if (cy) revalidateTag('portfolio-summary-' + access.orgId + '-' + cy.year, 'max');
    return { success: true, deduction };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create deduction' };
  }
}

export async function updateDeduction(id: string, data: DeductionFormValues) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(data.buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  const [cy] = await db.select().from(complianceYears)
    .where(eq(complianceYears.id, data.complianceYearId)).limit(1);
  if (cy?.locked) return { error: 'Compliance year is locked' };

  try {
    const deduction = await db.transaction(async (tx) => {
      const [updated] = await tx.update(deductions).set({
        deductionType: data.deductionType,
        description: data.description || null,
        amountTco2e: data.amountTco2e,
        documentationId: data.documentationId || null,
      }).where(and(eq(deductions.id, id), eq(deductions.buildingId, data.buildingId))).returning();

      await updateDeductionTotals(data.complianceYearId, tx);
      return updated;
    });

    revalidatePath('/buildings/' + data.buildingId + '/deductions');
    revalidatePath('/buildings/' + data.buildingId + '/compliance');
    if (cy) revalidateTag('portfolio-summary-' + access.orgId + '-' + cy.year, 'max');
    return { success: true, deduction };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update deduction' };
  }
}

export async function deleteDeduction(id: string, buildingId: string, complianceYearId: string) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  // Verify building ownership and write permission
  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Building not found or access denied' };

  const [cy] = await db.select().from(complianceYears)
    .where(eq(complianceYears.id, complianceYearId)).limit(1);
  if (cy?.locked) return { error: 'Compliance year is locked' };

  try {
    await db.transaction(async (tx) => {
      await tx.delete(deductions).where(and(eq(deductions.id, id), eq(deductions.buildingId, buildingId)));
      await updateDeductionTotals(complianceYearId, tx);
    });

    revalidatePath('/buildings/' + buildingId + '/deductions');
    revalidatePath('/buildings/' + buildingId + '/compliance');
    if (cy) revalidateTag('portfolio-summary-' + access.orgId + '-' + cy.year, 'max');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to delete deduction' };
  }
}

export async function getDeductions(buildingId: string, year: number) {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized', data: [] };

  // Verify building ownership
  const access = await assertBuildingAccess(buildingId);
  if (!access) return { error: 'Building not found or access denied', data: [] };

  const [cy] = await db.select({ id: complianceYears.id }).from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  if (!cy) return { data: [] };

  const result = await db.select().from(deductions)
    .where(eq(deductions.complianceYearId, cy.id));

  return { data: result };
}
