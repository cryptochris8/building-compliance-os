'use server';

import { db } from '@/lib/db';
import { utilityAccounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

export async function getUtilityAccountsForBuilding(buildingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized', accounts: [] };
  }

  const rows = await db.select({
    id: utilityAccounts.id,
    accountNumber: utilityAccounts.accountNumber,
    utilityType: utilityAccounts.utilityType,
    providerName: utilityAccounts.providerName,
  }).from(utilityAccounts).where(eq(utilityAccounts.buildingId, buildingId));

  return { accounts: rows };
}
