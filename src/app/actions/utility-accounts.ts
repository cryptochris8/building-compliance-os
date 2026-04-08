'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { utilityAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAuthContext, assertBuildingAccess, WRITE_ROLES } from '@/lib/auth/helpers';
import { actionLimiter } from '@/lib/rate-limit';

export const utilityAccountSchema = z.object({
  buildingId: z.string().min(1),
  utilityType: z.enum(['electricity', 'natural_gas', 'district_steam', 'fuel_oil_2', 'fuel_oil_4']),
  accountNumber: z.string().optional(),
  providerName: z.string().optional(),
});

export type UtilityAccountFormValues = z.infer<typeof utilityAccountSchema>;

export async function getUtilityAccountsForBuilding(buildingId: string) {
  const access = await assertBuildingAccess(buildingId);
  if (!access) {
    return { error: 'Building not found or access denied', accounts: [] };
  }

  const rows = await db.select({
    id: utilityAccounts.id,
    accountNumber: utilityAccounts.accountNumber,
    utilityType: utilityAccounts.utilityType,
    providerName: utilityAccounts.providerName,
  }).from(utilityAccounts).where(eq(utilityAccounts.buildingId, buildingId));

  return { accounts: rows };
}

export async function createUtilityAccount(data: UtilityAccountFormValues) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };
  const { success: rlOk } = await actionLimiter.check(20, 'action:account:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  const access = await assertBuildingAccess(data.buildingId, WRITE_ROLES);
  if (!access) return { error: 'Unauthorized' };

  const validated = utilityAccountSchema.safeParse(data);
  if (!validated.success) return { error: 'Validation failed' };

  try {
    const [account] = await db.insert(utilityAccounts).values({
      buildingId: data.buildingId,
      utilityType: data.utilityType,
      accountNumber: data.accountNumber || null,
      providerName: data.providerName || null,
    }).returning();

    revalidatePath('/buildings/' + data.buildingId);
    revalidatePath('/buildings/' + data.buildingId + '/readings');
    return { success: true, account };
  } catch (error) {
    console.error('Failed to create utility account:', error);
    return { error: 'Failed to create utility account' };
  }
}

export async function updateUtilityAccount(accountId: string, data: UtilityAccountFormValues) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };
  const { success: rlOk } = await actionLimiter.check(20, 'action:account:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  const access = await assertBuildingAccess(data.buildingId, WRITE_ROLES);
  if (!access) return { error: 'Unauthorized' };

  const validated = utilityAccountSchema.safeParse(data);
  if (!validated.success) return { error: 'Validation failed' };

  try {
    const [account] = await db.update(utilityAccounts).set({
      accountNumber: data.accountNumber || null,
      providerName: data.providerName || null,
      utilityType: data.utilityType,
    }).where(and(
      eq(utilityAccounts.id, accountId),
      eq(utilityAccounts.buildingId, data.buildingId)
    )).returning();

    revalidatePath('/buildings/' + data.buildingId);
    revalidatePath('/buildings/' + data.buildingId + '/readings');
    return { success: true, account };
  } catch (error) {
    console.error('Failed to update utility account:', error);
    return { error: 'Failed to update utility account' };
  }
}

export async function deleteUtilityAccount(accountId: string, buildingId: string) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };
  const { success: rlOk } = await actionLimiter.check(20, 'action:account:' + ctx.user.id);
  if (!rlOk) return { error: 'Too many requests. Please try again later.' };

  const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
  if (!access) return { error: 'Unauthorized' };

  try {
    await db.delete(utilityAccounts).where(and(
      eq(utilityAccounts.id, accountId),
      eq(utilityAccounts.buildingId, buildingId)
    ));

    revalidatePath('/buildings/' + buildingId);
    revalidatePath('/buildings/' + buildingId + '/readings');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete utility account:', error);
    return { error: 'Failed to delete utility account' };
  }
}
