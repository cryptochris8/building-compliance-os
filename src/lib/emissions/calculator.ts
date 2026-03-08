import { getJurisdiction } from '@/lib/jurisdictions';
import type { CarbonCoefficients, CompliancePeriod } from '@/lib/jurisdictions/types';

// ============================================================
// Unit Conversion Helpers
// ============================================================

/** Convert therms to kBtu */
export function thermsToKbtu(therms: number): number {
  return therms * 100;
}

/** Convert gallons of fuel oil #2 to kBtu */
export function fuelOil2GallonsToKbtu(gallons: number): number {
  return gallons * 138.5;
}

/** Convert gallons of fuel oil #4 to kBtu */
export function fuelOil4GallonsToKbtu(gallons: number): number {
  return gallons * 145.1;
}

/** Convert Mlb (thousand pounds) of district steam to kBtu */
export function districtSteamMlbToKbtu(mlb: number): number {
  return mlb * 1194;
}

/** Normalize a utility reading to its kBtu equivalent (except electricity which stays as kWh) */
export function normalizeConsumption(
  value: number,
  unit: string,
  utilityType: string
): { value: number; unit: string } {
  switch (utilityType) {
    case 'electricity':
      // Keep as kWh - coefficients are per kWh
      if (unit === 'kWh' || unit === 'kwh') return { value, unit: 'kWh' };
      if (unit === 'MWh' || unit === 'mwh') return { value: value * 1000, unit: 'kWh' };
      throw new Error(`Unsupported unit "${unit}" for utility type "${utilityType}". Expected kWh or MWh.`);
    case 'natural_gas':
      if (unit === 'therms') return { value: thermsToKbtu(value), unit: 'kBtu' };
      if (unit === 'kBtu' || unit === 'kbtu') return { value, unit: 'kBtu' };
      if (unit === 'ccf') return { value: thermsToKbtu(value * 1.037), unit: 'kBtu' };
      throw new Error(`Unsupported unit "${unit}" for utility type "${utilityType}". Expected therms, kBtu, or ccf.`);
    case 'fuel_oil_2':
      if (unit === 'gallons') return { value: fuelOil2GallonsToKbtu(value), unit: 'kBtu' };
      if (unit === 'kBtu' || unit === 'kbtu') return { value, unit: 'kBtu' };
      throw new Error(`Unsupported unit "${unit}" for utility type "${utilityType}". Expected gallons or kBtu.`);
    case 'fuel_oil_4':
      if (unit === 'gallons') return { value: fuelOil4GallonsToKbtu(value), unit: 'kBtu' };
      if (unit === 'kBtu' || unit === 'kbtu') return { value, unit: 'kBtu' };
      throw new Error(`Unsupported unit "${unit}" for utility type "${utilityType}". Expected gallons or kBtu.`);
    case 'district_steam':
      if (unit === 'Mlb' || unit === 'mlb') return { value: districtSteamMlbToKbtu(value), unit: 'kBtu' };
      if (unit === 'kBtu' || unit === 'kbtu') return { value, unit: 'kBtu' };
      throw new Error(`Unsupported unit "${unit}" for utility type "${utilityType}". Expected Mlb or kBtu.`);
    default:
      throw new Error(`Unknown utility type: "${utilityType}"`);
  }
}
// ============================================================
// Core Types for Calculator
// ============================================================

export interface UtilityReadingInput {
  utilityType: string;
  consumptionValue: number;
  consumptionUnit: string;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
}

export interface EmissionsResult {
  totalEmissionsTco2e: number;
  breakdownByFuel: Record<string, number>;
  breakdownByMonth: Record<string, number>;
}

export interface ComplianceResult {
  totalEmissionsTco2e: number;
  emissionsLimitTco2e: number;
  emissionsOverLimit: number;
  estimatedPenaltyDollars: number;
  status: 'incomplete' | 'compliant' | 'at_risk' | 'over_limit';
  dataCompletenessPct: number;
  missingMonths: string[];
}

// ============================================================
// Helper: Find the compliance period for a given year
// ============================================================

function findPeriod(jurisdictionId: string, year: number): CompliancePeriod {
  const jurisdiction = getJurisdiction(jurisdictionId);
  const period = jurisdiction.periods.find(
    (p) => year >= p.startYear && year <= p.endYear
  );
  if (!period) {
    throw new Error(
      `No compliance period found for jurisdiction ${jurisdictionId} and year ${year}`
    );
  }
  return period;
}

// ============================================================
// Get the coefficient key for a utility type
// ============================================================

function getCoefficientKey(utilityType: string): keyof CarbonCoefficients {
  const map: Record<string, keyof CarbonCoefficients> = {
    electricity: 'electricity_kwh',
    natural_gas: 'natural_gas_kbtu',
    district_steam: 'district_steam_kbtu',
    fuel_oil_2: 'fuel_oil_2_kbtu',
    fuel_oil_4: 'fuel_oil_4_kbtu',
  };
  const key = map[utilityType];
  if (!key) {
    throw new Error(`Unknown utility type: ${utilityType}`);
  }
  return key;
}
// ============================================================
// Calculate Building Emissions
// ============================================================

/**
 * Calculate total tCO2e from utility readings for a building in a given year.
 */
export function calculateBuildingEmissions(
  readings: UtilityReadingInput[],
  jurisdictionId: string,
  year: number
): EmissionsResult {
  const period = findPeriod(jurisdictionId, year);
  const breakdownByFuel: Record<string, number> = {};
  const breakdownByMonth: Record<string, number> = {};
  let totalEmissionsTco2e = 0;

  for (const reading of readings) {
    // Filter to readings in the target year
    const startYear = new Date(reading.periodStart).getFullYear();
    const endYear = new Date(reading.periodEnd).getFullYear();
    if (startYear !== year && endYear !== year) continue;

    const normalized = normalizeConsumption(
      reading.consumptionValue,
      reading.consumptionUnit,
      reading.utilityType
    );

    const coeffKey = getCoefficientKey(reading.utilityType);
    const coefficient = period.coefficients[coeffKey];
    const emissions = normalized.value * coefficient;

    totalEmissionsTco2e += emissions;

    // Track by fuel type
    const fuelKey = reading.utilityType;
    breakdownByFuel[fuelKey] = (breakdownByFuel[fuelKey] || 0) + emissions;

    // Track by month (use period start month)
    const monthKey = reading.periodStart.substring(0, 7); // YYYY-MM
    breakdownByMonth[monthKey] = (breakdownByMonth[monthKey] || 0) + emissions;
  }

  return {
    totalEmissionsTco2e: Math.round(totalEmissionsTco2e * 1000) / 1000,
    breakdownByFuel,
    breakdownByMonth,
  };
}

// ============================================================
// Calculate Emissions Limit
// ============================================================

/**
 * Calculate the annual emissions limit for a building based on its size and occupancy type.
 * Returns tCO2e limit for the year.
 */
export function calculateEmissionsLimit(
  grossSqft: number,
  occupancyType: string,
  jurisdictionId: string,
  year: number
): number {
  const period = findPeriod(jurisdictionId, year);
  const limitPerSqft = period.limits[occupancyType];
  if (limitPerSqft === undefined) {
    throw new Error(
      `No emissions limit found for occupancy type "${occupancyType}" in jurisdiction ${jurisdictionId}`
    );
  }
  return Math.round(grossSqft * limitPerSqft * 1000) / 1000;
}
// ============================================================
// Calculate Penalty
// ============================================================

/**
 * Calculate the estimated penalty for exceeding the emissions limit.
 */
export function calculatePenalty(
  actualEmissions: number,
  limit: number,
  jurisdictionId: string,
  year: number
): number {
  if (actualEmissions <= limit) return 0;
  const period = findPeriod(jurisdictionId, year);
  const overLimit = actualEmissions - limit;
  return Math.round(overLimit * period.penaltyPerTon * 100) / 100;
}

// ============================================================
// Calculate Compliance Status
// ============================================================

/**
 * Determine the compliance status based on actual emissions vs limit.
 */
export function calculateComplianceStatus(
  actualEmissions: number,
  limit: number
): 'incomplete' | 'compliant' | 'at_risk' | 'over_limit' {
  if (actualEmissions <= 0) return 'incomplete';
  const ratio = actualEmissions / limit;
  if (ratio > 1.0) return 'over_limit';
  if (ratio > 0.9) return 'at_risk';
  return 'compliant';
}

// ============================================================
// Detect Missing Months
// ============================================================

/**
 * Detect which months are missing data for a given year.
 * Returns an array of missing month strings like ['2024-01', '2024-02'].
 */
export function detectMissingMonths(
  readings: UtilityReadingInput[],
  year: number
): string[] {
  const coveredMonths = new Set<string>();

  for (const reading of readings) {
    const start = new Date(reading.periodStart);
    const end = new Date(reading.periodEnd);

    // Iterate through months covered by this reading
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      if (current.getFullYear() === year) {
        const monthStr = current.getFullYear() + '-' +
          String(current.getMonth() + 1).padStart(2, '0');
        coveredMonths.add(monthStr);
      }
      current.setMonth(current.getMonth() + 1);
    }
  }

  const missingMonths: string[] = [];
  for (let month = 1; month <= 12; month++) {
    const monthStr = year + '-' + String(month).padStart(2, '0');
    if (!coveredMonths.has(monthStr)) {
      missingMonths.push(monthStr);
    }
  }

  return missingMonths;
}

// ============================================================
// Full Compliance Calculation
// ============================================================

/**
 * Run a full compliance calculation for a building.
 */
export function calculateCompliance(
  readings: UtilityReadingInput[],
  grossSqft: number,
  occupancyType: string,
  jurisdictionId: string,
  year: number
): ComplianceResult {
  const emissions = calculateBuildingEmissions(readings, jurisdictionId, year);
  const limit = calculateEmissionsLimit(grossSqft, occupancyType, jurisdictionId, year);
  const penalty = calculatePenalty(emissions.totalEmissionsTco2e, limit, jurisdictionId, year);
  const missingMonths = detectMissingMonths(readings, year);
  const dataCompletenessPct = Math.round(((12 - missingMonths.length) / 12) * 100);
  const overLimit = Math.max(0, emissions.totalEmissionsTco2e - limit);

  let status = calculateComplianceStatus(emissions.totalEmissionsTco2e, limit);
  if (missingMonths.length > 0 && status === 'compliant') {
    status = 'incomplete';
  }

  return {
    totalEmissionsTco2e: emissions.totalEmissionsTco2e,
    emissionsLimitTco2e: limit,
    emissionsOverLimit: Math.round(overLimit * 1000) / 1000,
    estimatedPenaltyDollars: penalty,
    status,
    dataCompletenessPct,
    missingMonths,
  };
}
