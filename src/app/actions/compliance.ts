'use server';

import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  calculateBuildingCompliance,
  recalculateAllBuildings,
  getComplianceSummary,
  type ComplianceResultWithBreakdown,
  type PortfolioSummary,
} from '@/lib/emissions/compliance-service';

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

export async function calculateCompliance(
  buildingId: string,
  year: number
): Promise<{ data?: ComplianceResultWithBreakdown; error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Unauthorized' };

  try {
    const result = await calculateBuildingCompliance(buildingId, year);
    return { data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calculation failed';
    return { error: message };
  }
}

export async function recalculatePortfolio(
  year: number
): Promise<{ data?: ComplianceResultWithBreakdown[]; error?: string }> {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: 'Unauthorized or no organization' };

  try {
    const results = await recalculateAllBuildings(orgId, year);
    return { data: results };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Portfolio recalculation failed';
    return { error: message };
  }
}

export async function getPortfolioSummary(
  year: number
): Promise<{ data?: PortfolioSummary; error?: string }> {
  const orgId = await getUserOrgId();
  if (!orgId) return { error: 'Unauthorized or no organization' };

  try {
    const summary = await getComplianceSummary(orgId, year);
    return { data: summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get portfolio summary';
    return { error: message };
  }
}
