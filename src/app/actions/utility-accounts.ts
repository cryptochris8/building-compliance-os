'use server';

import { db } from '@/lib/db';
import { utilityAccounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { assertBuildingAccess } from '@/lib/auth/helpers';

export async function getUtilityAccountsForBuilding(buildingId: string) {
  // Verify building ownership
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
