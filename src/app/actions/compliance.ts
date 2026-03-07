'use server';

import {
  calculateBuildingCompliance,
  recalculateAllBuildings,
  getComplianceSummary,
  type ComplianceResultWithBreakdown,
  type PortfolioSummary,
} from '@/lib/emissions/compliance-service';
import { assertBuildingAccess, getUserOrgId } from '@/lib/auth/helpers';

export async function calculateCompliance(
  buildingId: string,
  year: number
): Promise<{ data?: ComplianceResultWithBreakdown; error?: string }> {
  // Verify building ownership
  const access = await assertBuildingAccess(buildingId);
  if (!access) return { error: 'Building not found or access denied' };

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
