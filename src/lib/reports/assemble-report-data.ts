import { db } from '@/lib/db';
import { buildings, organizations, complianceYears, utilityAccounts, utilityReadings, deductions, documents } from '@/lib/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { calculateBuildingEmissions, type UtilityReadingInput } from '@/lib/emissions/calculator';
import type { ReportData } from '@/lib/reports/compliance-report';

/**
 * Assembles all the data required for a compliance report.
 * Shared between the synchronous API route and the async Inngest background job.
 *
 * Returns `null` if the building or compliance year is not found,
 * along with an `error` string describing the issue.
 */
export async function assembleReportData(
  buildingId: string,
  year: number
): Promise<{ data: ReportData; buildingName: string } | { data: null; error: string }> {
  // Fetch building
  const [building] = await db.select().from(buildings)
    .where(eq(buildings.id, buildingId)).limit(1);
  if (!building) return { data: null, error: 'Building not found: ' + buildingId };

  // Fetch org
  const [org] = await db.select().from(organizations)
    .where(eq(organizations.id, building.organizationId)).limit(1);

  // Fetch compliance year
  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);
  if (!cy) return { data: null, error: 'No compliance data for year ' + year };

  // Fetch accounts + readings
  const accounts = await db.select().from(utilityAccounts)
    .where(eq(utilityAccounts.buildingId, buildingId));
  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.utilityType]));

  const yearStart = year + '-01-01';
  const yearEnd = year + '-12-31';
  const readings = await db.select().from(utilityReadings)
    .where(and(
      eq(utilityReadings.buildingId, buildingId),
      sql`${utilityReadings.periodStart} >= ${yearStart}`,
      sql`${utilityReadings.periodEnd} <= ${yearEnd}`
    ));

  // Fetch deductions
  const deds = await db.select().from(deductions)
    .where(eq(deductions.complianceYearId, cy.id));

  // Fetch documents
  const docs = await db.select().from(documents)
    .where(eq(documents.buildingId, buildingId));

  // Build emissions using actual coefficients
  // Filter out readings with unknown account types to avoid incorrect emissions
  const knownReadings = readings.filter((r) => {
    const utilType = accountTypeMap.get(r.utilityAccountId);
    if (!utilType) {
      console.warn('Report: skipping reading ' + r.id + ' — unknown utility account ' + r.utilityAccountId);
      return false;
    }
    return true;
  });

  const readingInputs: UtilityReadingInput[] = knownReadings.map((r) => ({
    utilityType: accountTypeMap.get(r.utilityAccountId)!,
    consumptionValue: Number(r.consumptionValue),
    consumptionUnit: r.consumptionUnit,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
  }));

  const emissionsCalc = calculateBuildingEmissions(readingInputs, building.jurisdictionId, year);

  const fuelTotals: Record<string, { consumption: number; unit: string }> = {};
  const monthlyData: Record<string, Record<string, number>> = {};

  for (const r of knownReadings) {
    const utilType = accountTypeMap.get(r.utilityAccountId)!;
    const val = Number(r.consumptionValue);
    if (!fuelTotals[utilType]) fuelTotals[utilType] = { consumption: 0, unit: r.consumptionUnit };
    fuelTotals[utilType].consumption += val;

    const month = r.periodStart.substring(0, 7);
    if (!monthlyData[month]) monthlyData[month] = {};
    const key = utilType === 'natural_gas' ? 'naturalGas' :
      utilType === 'district_steam' ? 'districtSteam' :
      utilType === 'fuel_oil_2' ? 'fuelOil2' :
      utilType === 'fuel_oil_4' ? 'fuelOil4' : 'electricity';
    monthlyData[month][key] = (monthlyData[month][key] || 0) + val;
  }

  const totalEmissions = emissionsCalc.totalEmissionsTco2e;
  const emissionsByFuel = Object.entries(fuelTotals).map(([type, data]) => ({
    utilityType: type.replace('_', ' '),
    annualConsumption: data.consumption,
    unit: data.unit,
    coefficient: 0,
    emissions: emissionsCalc.breakdownByFuel[type] || 0,
    percentOfTotal: totalEmissions > 0 ? ((emissionsCalc.breakdownByFuel[type] || 0) / totalEmissions) * 100 : 0,
  }));

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = year + '-' + String(m).padStart(2, '0');
    const md = monthlyData[key] || {};
    months.push({
      month: key,
      electricity: md.electricity || 0,
      naturalGas: md.naturalGas || 0,
      districtSteam: md.districtSteam || 0,
      fuelOil2: md.fuelOil2 || 0,
      fuelOil4: md.fuelOil4 || 0,
    });
  }

  // Build year-over-year
  const allYears = await db.select().from(complianceYears)
    .where(eq(complianceYears.buildingId, buildingId))
    .orderBy(desc(complianceYears.year));
  const yearOverYear = allYears.map((y) => ({
    year: y.year,
    emissions: Number(y.totalEmissionsTco2e || 0),
    limit: Number(y.emissionsLimitTco2e || 0),
    trend: Number(y.totalEmissionsTco2e || 0) > Number(y.emissionsLimitTco2e || 0) ? 'Over' : 'Under',
  }));

  // Build data sources
  const dataSources = accounts.map((a) => ({
    accountName: a.accountNumber || 'Account',
    utilityType: a.utilityType,
    source: 'manual',
    readingCount: readings.filter((r) => r.utilityAccountId === a.id).length,
    confidence: 'confirmed',
  }));

  const reportData: ReportData = {
    building: {
      name: building.name,
      address: (building.addressLine1 ?? '') + ', ' + (building.city ?? '') + ', ' + (building.state ?? '') + ' ' + (building.zip ?? ''),
      bbl: building.bbl,
      bin: building.bin,
      occupancyType: building.occupancyType,
      grossSqft: Number(building.grossSqft),
      jurisdictionId: building.jurisdictionId,
    },
    compliance: {
      year,
      status: cy.status || 'incomplete',
      totalEmissions,
      emissionsLimit: Number(cy.emissionsLimitTco2e || 0),
      emissionsOverLimit: Number(cy.emissionsOverLimit || 0),
      penalty: Number(cy.estimatedPenaltyDollars || 0),
      completeness: Number(cy.dataCompletenessPct || 0),
      totalDeductions: Number(cy.totalDeductionsTco2e || 0),
      netEmissions: Number(cy.netEmissionsTco2e || 0),
    },
    emissionsByFuel,
    monthlyConsumption: months,
    yearOverYear,
    dataSources,
    deductions: deds.map((d) => ({
      type: d.deductionType,
      description: d.description || '',
      amount: Number(d.amountTco2e),
      verified: d.verified || false,
    })),
    documents: docs.map((d) => ({
      fileName: d.fileName,
      documentType: d.documentType || 'other',
      uploadDate: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '',
    })),
    organizationName: org?.name || 'Unknown',
    generatedAt: new Date().toISOString(),
  };

  return { data: reportData, buildingName: building.name };
}
