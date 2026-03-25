import { db } from '@/lib/db';
import { buildings, utilityReadings, utilityAccounts, complianceYears, deductions } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import {
  calculateBuildingEmissions,
  calculateEmissionsLimit,
  calculatePenalty,
  calculateComplianceStatus,
  detectMissingMonths,
  type UtilityReadingInput,
  type ComplianceResult,
} from './calculator';
import { calculateMixedUseLimit, type OccupancyMixEntry } from './mixed-use';
import type { PortfolioSummary, PortfolioBuildingRow } from './types';

export interface ComplianceResultWithBreakdown extends ComplianceResult {
  breakdownByFuel: Record<string, number>;
  breakdownByMonth: Record<string, number>;
  buildingId: string;
  year: number;
}

export type { PortfolioSummary, PortfolioBuildingRow };

/**
 * Calculate and persist emissions compliance for a single building and year.
 * Reads utility readings, calculates emissions by fuel type and month,
 * determines compliance status against the applicable limit, and upserts
 * the compliance_years record in a transaction.
 * @throws If the building is not found or the compliance year is locked.
 */
export async function calculateBuildingCompliance(
  buildingId: string,
  year: number
): Promise<ComplianceResultWithBreakdown> {
  const [building] = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1);
  if (!building) { throw new Error('Building not found: ' + buildingId); }

  const grossSqft = Number(building.grossSqft);
  const occupancyType = building.occupancyType;
  const jurisdictionId = building.jurisdictionId;
  const yearStart = year + '-01-01';
  const yearEnd = year + '-12-31';

  const rawReadings = await db.select({
    id: utilityReadings.id,
    utilityAccountId: utilityReadings.utilityAccountId,
    periodStart: utilityReadings.periodStart,
    periodEnd: utilityReadings.periodEnd,
    consumptionValue: utilityReadings.consumptionValue,
    consumptionUnit: utilityReadings.consumptionUnit,
    confidence: utilityReadings.confidence,
  }).from(utilityReadings).where(
    and(
      eq(utilityReadings.buildingId, buildingId),
      sql`${utilityReadings.periodStart} >= ${yearStart}`,
      sql`${utilityReadings.periodEnd} <= ${yearEnd}`
    )
  );

  const accounts = await db.select({ id: utilityAccounts.id, utilityType: utilityAccounts.utilityType })
    .from(utilityAccounts).where(eq(utilityAccounts.buildingId, buildingId));
  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.utilityType]));

  const readings: UtilityReadingInput[] = [];
  for (const r of rawReadings) {
    const utilityType = accountTypeMap.get(r.utilityAccountId);
    if (!utilityType) {
      console.warn('Reading ' + r.id + ' references unknown account ' + r.utilityAccountId + ' — skipping');
      continue;
    }
    readings.push({
      utilityType,
      consumptionValue: Number(r.consumptionValue),
      consumptionUnit: r.consumptionUnit,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
    });
  }

  const emissionsResult = calculateBuildingEmissions(readings, jurisdictionId, year);

  // Calculate limit: use mixed-use if occupancy_mix exists
  let limit: number;
  const occupancyMix = building.occupancyMix as OccupancyMixEntry[] | null;
  if (occupancyMix && Array.isArray(occupancyMix) && occupancyMix.length > 0) {
    limit = calculateMixedUseLimit(occupancyMix, jurisdictionId, year);
  } else {
    limit = calculateEmissionsLimit(grossSqft, occupancyType, jurisdictionId, year);
  }

  const penalty = calculatePenalty(emissionsResult.totalEmissionsTco2e, limit, jurisdictionId, year);
  const missingMonths = detectMissingMonths(readings, year);
  const dataCompletenessPct = Math.round(((12 - missingMonths.length) / 12) * 100);
  const overLimit = Math.max(0, emissionsResult.totalEmissionsTco2e - limit);

  let status = calculateComplianceStatus(emissionsResult.totalEmissionsTco2e, limit);
  if (missingMonths.length > 0 && status === 'compliant') { status = 'incomplete'; }

  const result: ComplianceResultWithBreakdown = {
    buildingId, year,
    totalEmissionsTco2e: emissionsResult.totalEmissionsTco2e,
    emissionsLimitTco2e: limit,
    emissionsOverLimit: Math.round(overLimit * 1000) / 1000,
    estimatedPenaltyDollars: penalty,
    status, dataCompletenessPct, missingMonths,
    breakdownByFuel: emissionsResult.breakdownByFuel,
    breakdownByMonth: emissionsResult.breakdownByMonth,
  };

  // Upsert compliance year in a transaction with lock check inside to prevent TOCTOU race
  await db.transaction(async (tx) => {
    // Re-check lock inside transaction using FOR UPDATE to prevent race conditions
    const existing = await tx.select({
      id: complianceYears.id,
      locked: complianceYears.locked,
    }).from(complianceYears)
      .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
      .for('update')
      .limit(1);

    if (existing.length > 0 && existing[0].locked) {
      throw new Error('Compliance year ' + year + ' is locked');
    }

    // Calculate deductions
    let totalDeductionsTco2e = 0;
    if (existing.length > 0) {
      const deds = await tx.select({ amountTco2e: deductions.amountTco2e })
        .from(deductions).where(eq(deductions.complianceYearId, existing[0].id));
      totalDeductionsTco2e = deds.reduce((sum, d) => sum + Number(d.amountTco2e || 0), 0);
    }

    const netEmissions = Math.max(0, emissionsResult.totalEmissionsTco2e - totalDeductionsTco2e);

    // Recalculate status, overLimit, and penalty based on net emissions (after deductions)
    const netOverLimit = Math.max(0, netEmissions - limit);
    const netStatus = missingMonths.length > 0 && calculateComplianceStatus(netEmissions, limit) === 'compliant'
      ? 'incomplete' as const
      : calculateComplianceStatus(netEmissions, limit);
    const netPenalty = calculatePenalty(netEmissions, limit, jurisdictionId, year);

    // Update the result object to reflect net emissions
    result.status = netStatus;
    result.emissionsOverLimit = Math.round(netOverLimit * 1000) / 1000;
    result.estimatedPenaltyDollars = netPenalty;

    const complianceData = {
      buildingId, year, jurisdictionId,
      totalEmissionsTco2e: String(result.totalEmissionsTco2e),
      emissionsLimitTco2e: String(result.emissionsLimitTco2e),
      emissionsOverLimit: String(result.emissionsOverLimit),
      estimatedPenaltyDollars: String(result.estimatedPenaltyDollars),
      status: result.status as 'incomplete' | 'compliant' | 'at_risk' | 'over_limit',
      dataCompletenessPct: String(result.dataCompletenessPct),
      missingMonths: result.missingMonths,
      totalDeductionsTco2e: String(Math.round(totalDeductionsTco2e * 1000) / 1000),
      netEmissionsTco2e: String(Math.round(netEmissions * 1000) / 1000),
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await tx.update(complianceYears).set(complianceData).where(eq(complianceYears.id, existing[0].id));
    } else {
      await tx.insert(complianceYears).values(complianceData);
    }
  });

  return result;
}

/**
 * Recalculate compliance for all buildings in an organization for a given year.
 * Skips locked compliance years and logs errors for individual failures.
 */
export async function recalculateAllBuildings(orgId: string, year: number): Promise<ComplianceResultWithBreakdown[]> {
  const orgBuildings = await db.select({ id: buildings.id }).from(buildings).where(eq(buildings.organizationId, orgId));
  const results: ComplianceResultWithBreakdown[] = [];
  for (const b of orgBuildings) {
    try {
      const r = await calculateBuildingCompliance(b.id, year);
      results.push(r);
    } catch (err) {
      console.error('Failed to calculate compliance for building ' + b.id + ':', err instanceof Error ? err.message : err);
    }
  }
  return results;
}

async function _getComplianceSummary(orgId: string, year: number): Promise<PortfolioSummary> {
  // Single query with LEFT JOIN instead of N+1
  const rows = await db.select({
    id: buildings.id,
    name: buildings.name,
    addressLine1: buildings.addressLine1,
    city: buildings.city,
    state: buildings.state,
    zip: buildings.zip,
    grossSqft: buildings.grossSqft,
    cyStatus: complianceYears.status,
    cyEmissions: complianceYears.totalEmissionsTco2e,
    cyLimit: complianceYears.emissionsLimitTco2e,
    cyPenalty: complianceYears.estimatedPenaltyDollars,
    cyCompleteness: complianceYears.dataCompletenessPct,
  }).from(buildings)
    .leftJoin(complianceYears, and(
      eq(complianceYears.buildingId, buildings.id),
      eq(complianceYears.year, year)
    ))
    .where(eq(buildings.organizationId, orgId));

  const buildingRows: PortfolioBuildingRow[] = [];
  let compliantCount = 0, atRiskCount = 0, overLimitCount = 0, incompleteCount = 0;
  let totalPenaltyExposure = 0, totalEmissions = 0;

  for (const row of rows) {
    const emissions = Number(row.cyEmissions || 0);
    const limit = Number(row.cyLimit || 0);
    const penalty = Number(row.cyPenalty || 0);
    const status = row.cyStatus || 'incomplete';
    const completeness = Number(row.cyCompleteness || 0);

    if (status === 'compliant') compliantCount++;
    else if (status === 'at_risk') atRiskCount++;
    else if (status === 'over_limit') overLimitCount++;
    else incompleteCount++;
    totalPenaltyExposure += penalty;
    totalEmissions += emissions;

    buildingRows.push({
      id: row.id, name: row.name,
      address: row.addressLine1 + ', ' + row.city + ', ' + row.state + ' ' + row.zip,
      grossSqft: Number(row.grossSqft), status, totalEmissions: emissions,
      emissionsLimit: limit, overUnder: emissions - limit, penalty, completeness,
    });
  }

  return {
    totalBuildings: rows.length, compliantCount, atRiskCount, overLimitCount, incompleteCount,
    totalPenaltyExposure: Math.round(totalPenaltyExposure * 100) / 100,
    totalEmissions: Math.round(totalEmissions * 1000) / 1000,
    buildings: buildingRows,
  };
}

/**
 * Get portfolio compliance summary for an organization and year.
 * Results are cached for 5 minutes, tagged for revalidation when data changes.
 */
export function getComplianceSummary(orgId: string, year: number): Promise<PortfolioSummary> {
  return unstable_cache(
    () => _getComplianceSummary(orgId, year),
    ['portfolio-summary', orgId, String(year)],
    { revalidate: 300, tags: ['portfolio-summary-' + orgId + '-' + year] }
  )();
}
