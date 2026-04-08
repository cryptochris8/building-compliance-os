import { describe, it, expect } from 'vitest';
import {
  thermsToKbtu,
  fuelOil2GallonsToKbtu,
  fuelOil4GallonsToKbtu,
  districtSteamMlbToKbtu,
  normalizeConsumption,
  calculateBuildingEmissions,
  calculateEmissionsLimit,
  calculatePenalty,
  calculateComplianceStatus,
  detectMissingMonths,
  calculateCompliance,
  type UtilityReadingInput,
} from '../calculator';

// ============================================================
// Unit Conversion Tests
// ============================================================

describe('Unit Conversions', () => {
  it('converts therms to kBtu correctly', () => {
    expect(thermsToKbtu(1)).toBe(100);
    expect(thermsToKbtu(10)).toBe(1000);
    expect(thermsToKbtu(0)).toBe(0);
  });

  it('converts fuel oil #2 gallons to kBtu', () => {
    expect(fuelOil2GallonsToKbtu(1)).toBe(138.5);
    expect(fuelOil2GallonsToKbtu(100)).toBe(13850);
  });

  it('converts fuel oil #4 gallons to kBtu', () => {
    expect(fuelOil4GallonsToKbtu(1)).toBe(145.1);
    expect(fuelOil4GallonsToKbtu(100)).toBe(14510);
  });

  it('converts district steam Mlb to kBtu', () => {
    expect(districtSteamMlbToKbtu(1)).toBe(1194);
    expect(districtSteamMlbToKbtu(10)).toBe(11940);
  });
});

// ============================================================
// Normalize Consumption Tests
// ============================================================

describe('normalizeConsumption', () => {
  it('keeps electricity kWh as-is', () => {
    const result = normalizeConsumption(1000, 'kwh', 'electricity');
    expect(result).toEqual({ value: 1000, unit: 'kWh' });
  });

  it('converts electricity MWh to kWh', () => {
    const result = normalizeConsumption(1, 'mwh', 'electricity');
    expect(result).toEqual({ value: 1000, unit: 'kWh' });
  });

  it('converts natural gas therms to kBtu', () => {
    const result = normalizeConsumption(50, 'therms', 'natural_gas');
    expect(result).toEqual({ value: 5000, unit: 'kBtu' });
  });

  it('converts natural gas ccf to kBtu', () => {
    const result = normalizeConsumption(100, 'ccf', 'natural_gas');
    // 100 ccf * 1.037 = 103.7 therms * 100 = 10370 kBtu
    expect(result.value).toBeCloseTo(10370, 0);
    expect(result.unit).toBe('kBtu');
  });

  it('passes natural gas kBtu through unchanged', () => {
    const result = normalizeConsumption(5000, 'kbtu', 'natural_gas');
    expect(result).toEqual({ value: 5000, unit: 'kBtu' });
  });

  it('converts fuel oil #2 gallons to kBtu', () => {
    const result = normalizeConsumption(100, 'gallons', 'fuel_oil_2');
    expect(result).toEqual({ value: 13850, unit: 'kBtu' });
  });

  it('converts fuel oil #4 gallons to kBtu', () => {
    const result = normalizeConsumption(100, 'gallons', 'fuel_oil_4');
    expect(result).toEqual({ value: 14510, unit: 'kBtu' });
  });

  it('converts district steam Mlb to kBtu', () => {
    const result = normalizeConsumption(10, 'mlb', 'district_steam');
    expect(result).toEqual({ value: 11940, unit: 'kBtu' });
  });

  it('throws for unknown utility type', () => {
    expect(() => normalizeConsumption(500, 'units', 'unknown_type')).toThrow('Unknown utility type');
  });

  it('throws for unknown unit within a known utility type', () => {
    expect(() => normalizeConsumption(100, 'MJ', 'electricity')).toThrow('Unsupported unit');
    expect(() => normalizeConsumption(100, 'liters', 'natural_gas')).toThrow('Unsupported unit');
    expect(() => normalizeConsumption(100, 'liters', 'fuel_oil_2')).toThrow('Unsupported unit');
    expect(() => normalizeConsumption(100, 'liters', 'fuel_oil_4')).toThrow('Unsupported unit');
    expect(() => normalizeConsumption(100, 'psi', 'district_steam')).toThrow('Unsupported unit');
  });
});

// ============================================================
// Emissions Calculation Tests
// ============================================================

describe('calculateBuildingEmissions', () => {
  const JURISDICTION = 'nyc-ll97';
  const YEAR = 2024;
  // Period 1 coefficients: electricity = 0.000288962 tCO2e/kWh

  it('calculates emissions for electricity readings', () => {
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'electricity',
        consumptionValue: 100000, // 100,000 kWh
        consumptionUnit: 'kwh',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      },
    ];

    const result = calculateBuildingEmissions(readings, JURISDICTION, YEAR);
    // 100000 * 0.000288962 = 28.8962 tCO2e
    expect(result.totalEmissionsTco2e).toBeCloseTo(28.896, 2);
    expect(result.breakdownByFuel['electricity']).toBeDefined();
    expect(result.breakdownByMonth['2024-01']).toBeDefined();
  });

  it('calculates emissions for natural gas readings', () => {
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'natural_gas',
        consumptionValue: 5000, // 5000 therms
        consumptionUnit: 'therms',
        periodStart: '2024-02-01',
        periodEnd: '2024-02-29',
      },
    ];

    const result = calculateBuildingEmissions(readings, JURISDICTION, YEAR);
    // 5000 therms = 500000 kBtu; 500000 * 0.00005311 = 26.555 tCO2e
    expect(result.totalEmissionsTco2e).toBeCloseTo(26.555, 2);
    expect(result.breakdownByFuel['natural_gas']).toBeDefined();
  });

  it('handles multiple fuel types', () => {
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'electricity',
        consumptionValue: 50000,
        consumptionUnit: 'kwh',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      },
      {
        utilityType: 'natural_gas',
        consumptionValue: 2000,
        consumptionUnit: 'therms',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      },
    ];

    const result = calculateBuildingEmissions(readings, JURISDICTION, YEAR);
    // Electricity: 50000 * 0.000288962 = 14.4481
    // Gas: 2000 * 100 = 200000 kBtu * 0.00005311 = 10.622
    // Total: ~25.07
    expect(result.totalEmissionsTco2e).toBeCloseTo(25.07, 1);
    expect(Object.keys(result.breakdownByFuel)).toHaveLength(2);
  });

  it('returns zero emissions for empty readings', () => {
    const result = calculateBuildingEmissions([], JURISDICTION, YEAR);
    expect(result.totalEmissionsTco2e).toBe(0);
    expect(Object.keys(result.breakdownByFuel)).toHaveLength(0);
  });

  it('filters out readings from other years', () => {
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'electricity',
        consumptionValue: 100000,
        consumptionUnit: 'kwh',
        periodStart: '2023-01-01',
        periodEnd: '2023-01-31',
      },
    ];

    const result = calculateBuildingEmissions(readings, JURISDICTION, YEAR);
    expect(result.totalEmissionsTco2e).toBe(0);
  });

  it('groups emissions by month correctly', () => {
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'electricity',
        consumptionValue: 10000,
        consumptionUnit: 'kwh',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      },
      {
        utilityType: 'electricity',
        consumptionValue: 12000,
        consumptionUnit: 'kwh',
        periodStart: '2024-02-01',
        periodEnd: '2024-02-29',
      },
    ];

    const result = calculateBuildingEmissions(readings, JURISDICTION, YEAR);
    expect(result.breakdownByMonth['2024-01']).toBeDefined();
    expect(result.breakdownByMonth['2024-02']).toBeDefined();
    expect(result.breakdownByMonth['2024-02']).toBeGreaterThan(
      result.breakdownByMonth['2024-01']
    );
  });
});

// ============================================================
// Emissions Limit Tests
// ============================================================

describe('calculateEmissionsLimit', () => {
  const JURISDICTION = 'nyc-ll97';

  it('calculates limit for B - Business occupancy (2024-2029)', () => {
    // B - Business limit: 0.00846 tCO2e/sqft for 2024-2029
    const limit = calculateEmissionsLimit(50000, 'B - Business', JURISDICTION, 2024);
    expect(limit).toBeCloseTo(50000 * 0.00846, 2);
  });

  it('calculates limit for R-2 Residential (2024-2029)', () => {
    // R-2 limit: 0.00675 tCO2e/sqft
    const limit = calculateEmissionsLimit(100000, 'R-2 - Residential (Multi-family)', JURISDICTION, 2024);
    expect(limit).toBeCloseTo(100000 * 0.00675, 2);
  });

  it('uses stricter limits for 2030-2034 period', () => {
    const limit2024 = calculateEmissionsLimit(50000, 'B - Business', JURISDICTION, 2024);
    const limit2030 = calculateEmissionsLimit(50000, 'B - Business', JURISDICTION, 2030);
    // 2030 limits are stricter (lower) for most categories
    // B - Business: 2024=0.00846, 2030=0.00453
    expect(limit2030).toBeLessThan(limit2024);
  });

  it('throws for unknown occupancy type', () => {
    expect(() =>
      calculateEmissionsLimit(50000, 'Z - Unknown', JURISDICTION, 2024)
    ).toThrow('No emissions limit found');
  });

  it('throws for unknown jurisdiction', () => {
    expect(() =>
      calculateEmissionsLimit(50000, 'B - Business', 'unknown-jur', 2024)
    ).toThrow('Unknown jurisdiction');
  });

  it('scales linearly with building size', () => {
    const limit50k = calculateEmissionsLimit(50000, 'B - Business', JURISDICTION, 2024);
    const limit100k = calculateEmissionsLimit(100000, 'B - Business', JURISDICTION, 2024);
    expect(limit100k).toBeCloseTo(limit50k * 2, 2);
  });
});

// ============================================================
// Penalty Calculation Tests
// ============================================================

describe('calculatePenalty', () => {
  const JURISDICTION = 'nyc-ll97';
  const YEAR = 2024;
  // Penalty: $268 per tCO2e over limit

  it('returns zero when under limit', () => {
    expect(calculatePenalty(100, 200, JURISDICTION, YEAR)).toBe(0);
  });

  it('returns zero when exactly at limit', () => {
    expect(calculatePenalty(200, 200, JURISDICTION, YEAR)).toBe(0);
  });

  it('calculates penalty when over limit', () => {
    // 10 tons over * $268/ton = $2,680
    const penalty = calculatePenalty(210, 200, JURISDICTION, YEAR);
    expect(penalty).toBe(2680);
  });

  it('calculates fractional penalty correctly', () => {
    // 0.5 tons over * $268 = $134
    const penalty = calculatePenalty(200.5, 200, JURISDICTION, YEAR);
    expect(penalty).toBe(134);
  });
});

// ============================================================
// Compliance Status Tests
// ============================================================

describe('calculateComplianceStatus', () => {
  it('returns compliant for zero emissions (zero-emission building)', () => {
    expect(calculateComplianceStatus(0, 100)).toBe('compliant');
  });

  it('returns incomplete for negative emissions', () => {
    expect(calculateComplianceStatus(-1, 100)).toBe('incomplete');
  });

  it('returns over_limit when limit is zero but emissions are positive', () => {
    expect(calculateComplianceStatus(50, 0)).toBe('over_limit');
  });

  it('returns compliant when both emissions and limit are zero', () => {
    expect(calculateComplianceStatus(0, 0)).toBe('compliant');
  });

  it('returns compliant when well under limit', () => {
    expect(calculateComplianceStatus(50, 100)).toBe('compliant');
  });

  it('returns at_risk when 90-100% of limit', () => {
    expect(calculateComplianceStatus(91, 100)).toBe('at_risk');
    expect(calculateComplianceStatus(95, 100)).toBe('at_risk');
    expect(calculateComplianceStatus(100, 100)).toBe('at_risk');
  });

  it('returns over_limit when exceeding limit', () => {
    expect(calculateComplianceStatus(101, 100)).toBe('over_limit');
    expect(calculateComplianceStatus(200, 100)).toBe('over_limit');
  });

  it('returns compliant at exactly 90%', () => {
    expect(calculateComplianceStatus(90, 100)).toBe('compliant');
  });
});

// ============================================================
// Missing Months Detection Tests
// ============================================================

describe('detectMissingMonths', () => {
  it('returns all 12 months for empty readings', () => {
    const missing = detectMissingMonths([], 2024);
    expect(missing).toHaveLength(12);
    expect(missing[0]).toBe('2024-01');
    expect(missing[11]).toBe('2024-12');
  });

  it('detects no missing months when all covered', () => {
    const readings: UtilityReadingInput[] = [];
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(2024, m, 0).getDate();
      readings.push({
        utilityType: 'electricity',
        consumptionValue: 1000,
        consumptionUnit: 'kwh',
        periodStart: `2024-${month}-01`,
        periodEnd: `2024-${month}-${lastDay}`,
      });
    }
    const missing = detectMissingMonths(readings, 2024);
    expect(missing).toHaveLength(0);
  });

  it('detects specific missing months', () => {
    // Use mid-month dates to avoid timezone edge cases with month boundaries
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'electricity',
        consumptionValue: 1000,
        consumptionUnit: 'kwh',
        periodStart: '2024-01-15',
        periodEnd: '2024-01-15',
      },
      {
        utilityType: 'electricity',
        consumptionValue: 1000,
        consumptionUnit: 'kwh',
        periodStart: '2024-06-15',
        periodEnd: '2024-06-15',
      },
    ];

    const missing = detectMissingMonths(readings, 2024);
    expect(missing).not.toContain('2024-01');
    expect(missing).not.toContain('2024-06');
    expect(missing).toContain('2024-02');
    expect(missing).toContain('2024-12');
    expect(missing).toHaveLength(10);
  });

  it('handles multi-month reading spans', () => {
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'electricity',
        consumptionValue: 3000,
        consumptionUnit: 'kwh',
        periodStart: '2024-01-01',
        periodEnd: '2024-03-31',
      },
    ];

    const missing = detectMissingMonths(readings, 2024);
    expect(missing).not.toContain('2024-01');
    expect(missing).not.toContain('2024-02');
    expect(missing).not.toContain('2024-03');
    expect(missing).toHaveLength(9);
  });

  it('ignores readings from other years', () => {
    const readings: UtilityReadingInput[] = [
      {
        utilityType: 'electricity',
        consumptionValue: 1000,
        consumptionUnit: 'kwh',
        periodStart: '2023-01-01',
        periodEnd: '2023-12-31',
      },
    ];

    const missing = detectMissingMonths(readings, 2024);
    expect(missing).toHaveLength(12);
  });
});

// ============================================================
// Full Compliance Calculation Tests
// ============================================================

describe('calculateCompliance', () => {
  const JURISDICTION = 'nyc-ll97';
  const YEAR = 2024;
  const SQFT = 50000;
  const OCCUPANCY = 'B - Business';
  // Limit: 50000 * 0.00846 = 423 tCO2e

  function makeFullYearReadings(monthlyKwh: number): UtilityReadingInput[] {
    const readings: UtilityReadingInput[] = [];
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(YEAR, m, 0).getDate();
      readings.push({
        utilityType: 'electricity',
        consumptionValue: monthlyKwh,
        consumptionUnit: 'kwh',
        periodStart: `${YEAR}-${month}-01`,
        periodEnd: `${YEAR}-${month}-${lastDay}`,
      });
    }
    return readings;
  }

  it('returns compliant status when under limit with full data', () => {
    // Need total emissions < 423 tCO2e
    // 423 / 0.000288962 / 12 ≈ 121,950 kWh/month to be exactly at limit
    // Use 50,000 kWh/month → ~173 tCO2e/year (well under 423)
    const readings = makeFullYearReadings(50000);
    const result = calculateCompliance(readings, SQFT, OCCUPANCY, JURISDICTION, YEAR);

    expect(result.status).toBe('compliant');
    expect(result.dataCompletenessPct).toBe(100);
    expect(result.missingMonths).toHaveLength(0);
    expect(result.emissionsOverLimit).toBe(0);
    expect(result.estimatedPenaltyDollars).toBe(0);
  });

  it('returns over_limit status and penalty when exceeding limit', () => {
    // 200,000 kWh/month * 12 = 2,400,000 kWh
    // 2,400,000 * 0.000288962 = ~693.5 tCO2e (over 423 limit)
    const readings = makeFullYearReadings(200000);
    const result = calculateCompliance(readings, SQFT, OCCUPANCY, JURISDICTION, YEAR);

    expect(result.status).toBe('over_limit');
    expect(result.emissionsOverLimit).toBeGreaterThan(0);
    expect(result.estimatedPenaltyDollars).toBeGreaterThan(0);
    // Penalty should be (693.5 - 423) * 268 ≈ $72,494
    expect(result.estimatedPenaltyDollars).toBeGreaterThan(50000);
  });

  it('returns incomplete when data is missing even if under limit', () => {
    // Only 6 months of data
    const readings: UtilityReadingInput[] = [];
    for (let m = 1; m <= 6; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(YEAR, m, 0).getDate();
      readings.push({
        utilityType: 'electricity',
        consumptionValue: 10000,
        consumptionUnit: 'kwh',
        periodStart: `${YEAR}-${month}-01`,
        periodEnd: `${YEAR}-${month}-${lastDay}`,
      });
    }

    const result = calculateCompliance(readings, SQFT, OCCUPANCY, JURISDICTION, YEAR);
    expect(result.status).toBe('incomplete');
    expect(result.dataCompletenessPct).toBe(50);
    expect(result.missingMonths).toHaveLength(6);
  });

  it('returns at_risk when close to limit', () => {
    // Need ~91-100% of 423 limit → ~385-423 tCO2e
    // 400 / 0.000288962 / 12 ≈ 115,377 kWh/month
    const readings = makeFullYearReadings(115000);
    const result = calculateCompliance(readings, SQFT, OCCUPANCY, JURISDICTION, YEAR);

    // 115000 * 12 * 0.000288962 ≈ 398.7 tCO2e
    // 398.7 / 423 ≈ 0.943 → at_risk (> 0.9)
    expect(result.status).toBe('at_risk');
  });

  it('has correct data completeness percentage', () => {
    // 9 months of data = 75%
    const readings: UtilityReadingInput[] = [];
    for (let m = 1; m <= 9; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(YEAR, m, 0).getDate();
      readings.push({
        utilityType: 'electricity',
        consumptionValue: 10000,
        consumptionUnit: 'kwh',
        periodStart: `${YEAR}-${month}-01`,
        periodEnd: `${YEAR}-${month}-${lastDay}`,
      });
    }

    const result = calculateCompliance(readings, SQFT, OCCUPANCY, JURISDICTION, YEAR);
    expect(result.dataCompletenessPct).toBe(75);
  });
});
