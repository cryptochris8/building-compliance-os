import { db } from '@/lib/db';
import { buildings, utilityReadings, utilityAccounts, complianceYears, deductions } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
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

export interface ComplianceResultWithBreakdown extends ComplianceResult {
  breakdownByFuel: Record<string, number>;
  breakdownByMonth: Record<string, number>;
  buildingId: string;
  year: number;
}

export interface PortfolioSummary {
  totalBuildings: number;
  compliantCount: number;
  atRiskCount: number;
  overLimitCount: number;
  incompleteCount: number;
  totalPenaltyExposure: number;
  totalEmissions: number;
  buildings: PortfolioBuildingRow[];
}

export interface PortfolioBuildingRow {
  id: string;
  name: string;
  address: string;
  grossSqft: number;
  status: string;
  totalEmissions: number;
  emissionsLimit: number;
  overUnder: number;
  penalty: number;
  completeness: number;
}

export async function calculateBuildingCompliance(
  buildingId: string,
  year: number
): Promise<ComplianceResultWithBreakdown> {
  const [building] = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1);
  if (!building) { throw new Error('Building not found: ' + buildingId); }

  // Check if locked
  const [existingCY] = await db.select({ locked: complianceYears.locked }).from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year))).limit(1);
  if (existingCY?.locked) { throw new Error('Compliance year ' + year + ' is locked'); }

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

  const readings: UtilityReadingInput[] = rawReadings.map((r) => ({
    utilityType: accountTypeMap.get(r.utilityAccountId) || 'electricity',
    consumptionValue: Number(r.consumptionValue),
    consumptionUnit: r.consumptionUnit,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
  }));

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

  const existing = await db.select({ id: complianceYears.id }).from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year))).limit(1);

  // Calculate deductions
  let totalDeductionsTco2e = 0;
  if (existing.length > 0) {
    const deds = await db.select({ amountTco2e: deductions.amountTco2e })
      .from(deductions).where(eq(deductions.complianceYearId, existing[0].id));
    totalDeductionsTco2e = deds.reduce((sum, d) => sum + Number(d.amountTco2e || 0), 0);
  }

  const netEmissions = Math.max(0, emissionsResult.totalEmissionsTco2e - totalDeductionsTco2e);

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
    await db.update(complianceYears).set(complianceData).where(eq(complianceYears.id, existing[0].id));
  } else {
    await db.insert(complianceYears).values(complianceData);
  }
  return result;
}

export async function recalculateAllBuildings(orgId: string, year: number): Promise<ComplianceResultWithBreakdown[]> {
  const orgBuildings = await db.select({ id: buildings.id }).from(buildings).where(eq(buildings.organizationId, orgId));
  const results: ComplianceResultWithBreakdown[] = [];
  for (const b of orgBuildings) {
    try { const r = await calculateBuildingCompliance(b.id, year); results.push(r); } catch { /* skip */ }
  }
  return results;
}

export async function getComplianceSummary(orgId: string, year: number): Promise<PortfolioSummary> {
  const orgBuildings = await db.select({
    id: buildings.id, name: buildings.name, addressLine1: buildings.addressLine1,
    city: buildings.city, state: buildings.state, zip: buildings.zip, grossSqft: buildings.grossSqft,
  }).from(buildings).where(eq(buildings.organizationId, orgId));

  const buildingRows: PortfolioBuildingRow[] = [];
  let compliantCount = 0, atRiskCount = 0, overLimitCount = 0, incompleteCount = 0;
  let totalPenaltyExposure = 0, totalEmissions = 0;

  for (const b of orgBuildings) {
    const [cy] = await db.select().from(complianceYears)
      .where(and(eq(complianceYears.buildingId, b.id), eq(complianceYears.year, year))).limit(1);
    const emissions = cy ? Number(cy.totalEmissionsTco2e || 0) : 0;
    const limit = cy ? Number(cy.emissionsLimitTco2e || 0) : 0;
    const penalty = cy ? Number(cy.estimatedPenaltyDollars || 0) : 0;
    const status = cy?.status || 'incomplete';
    const completeness = cy ? Number(cy.dataCompletenessPct || 0) : 0;

    if (status === 'compliant') compliantCount++;
    else if (status === 'at_risk') atRiskCount++;
    else if (status === 'over_limit') overLimitCount++;
    else incompleteCount++;
    totalPenaltyExposure += penalty;
    totalEmissions += emissions;

    buildingRows.push({
      id: b.id, name: b.name,
      address: b.addressLine1 + ', ' + b.city + ', ' + b.state + ' ' + b.zip,
      grossSqft: Number(b.grossSqft), status, totalEmissions: emissions,
      emissionsLimit: limit, overUnder: emissions - limit, penalty, completeness,
    });
  }

  return {
    totalBuildings: orgBuildings.length, compliantCount, atRiskCount, overLimitCount, incompleteCount,
    totalPenaltyExposure: Math.round(totalPenaltyExposure * 100) / 100,
    totalEmissions: Math.round(totalEmissions * 1000) / 1000,
    buildings: buildingRows,
  };
}
