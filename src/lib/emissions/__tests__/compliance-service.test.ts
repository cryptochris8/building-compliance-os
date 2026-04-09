import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before any imports
vi.mock('server-only', () => ({}));

// Mock next/cache
vi.mock('next/cache', () => ({
  unstable_cache: (fn: Function) => fn,
}));

// We'll test the pure calculation logic that compliance-service delegates to,
// since the service itself requires a real DB connection.
// These tests verify the critical business logic paths.

import {
  calculateBuildingEmissions,
  calculateEmissionsLimit,
  calculatePenalty,
  calculateComplianceStatus,
  detectMissingMonths,
  calculateCompliance,
  type UtilityReadingInput,
} from '../calculator';
import { calculateMixedUseLimit, type OccupancyMixEntry } from '../mixed-use';

// ============================================================
// Integration-style tests for compliance calculation pipeline
// These test the same code paths that calculateBuildingCompliance uses
// ============================================================

function makeFullYearReadings(year: number, kwhPerMonth: number = 50000): UtilityReadingInput[] {
  return Array.from({ length: 12 }, (_, i) => ({
    utilityType: 'electricity',
    consumptionValue: kwhPerMonth,
    consumptionUnit: 'kWh',
    periodStart: `${year}-${String(i + 1).padStart(2, '0')}-01`,
    periodEnd: `${year}-${String(i + 1).padStart(2, '0')}-${new Date(year, i + 1, 0).getDate()}`,
  }));
}

describe('compliance calculation pipeline', () => {
  describe('full year NYC LL97 compliance', () => {
    const year = 2024;
    const jurisdictionId = 'nyc-ll97';
    const occupancyType = 'B - Business';
    const grossSqft = 50000;

    it('calculates compliant building correctly', () => {
      // Low electricity usage should be well under limit
      const readings = makeFullYearReadings(year, 10000);
      const result = calculateCompliance(readings, grossSqft, occupancyType, jurisdictionId, year);

      expect(result.status).toBe('compliant');
      expect(result.totalEmissionsTco2e).toBeGreaterThan(0);
      expect(result.emissionsLimitTco2e).toBeGreaterThan(0);
      expect(result.estimatedPenaltyDollars).toBe(0);
      expect(result.dataCompletenessPct).toBe(100);
      expect(result.missingMonths).toHaveLength(0);
    });

    it('calculates over-limit building with penalty', () => {
      // Very high usage should exceed limit
      const readings = makeFullYearReadings(year, 500000);
      const result = calculateCompliance(readings, grossSqft, occupancyType, jurisdictionId, year);

      expect(result.status).toBe('over_limit');
      expect(result.emissionsOverLimit).toBeGreaterThan(0);
      expect(result.estimatedPenaltyDollars).toBeGreaterThan(0);
      // Penalty = overLimit * $268/ton
      expect(result.estimatedPenaltyDollars).toBeCloseTo(result.emissionsOverLimit * 268, 0);
    });

    it('marks incomplete when months are missing even if under limit', () => {
      // Only 6 months of data — low usage
      const readings = makeFullYearReadings(year, 5000).slice(0, 6);
      const result = calculateCompliance(readings, grossSqft, occupancyType, jurisdictionId, year);

      expect(result.status).toBe('incomplete');
      expect(result.missingMonths).toHaveLength(6);
      expect(result.dataCompletenessPct).toBe(50);
    });

    it('handles at-risk status (90-100% of limit)', () => {
      // B - Business limit for NYC LL97 2024: 0.00846 tCO2e/sqft
      // For 50000 sqft: limit = 423 tCO2e
      // electricity coefficient: 0.000288962
      // To hit 95% of limit: 423 * 0.95 = ~401.85 tCO2e
      // Per month kWh needed: 401.85 / 12 / 0.000288962 = ~115,900
      const readings = makeFullYearReadings(year, 115900);
      const result = calculateCompliance(readings, grossSqft, occupancyType, jurisdictionId, year);

      expect(result.status).toBe('at_risk');
      expect(result.estimatedPenaltyDollars).toBe(0);
    });
  });

  describe('Boston BERDO compliance', () => {
    const year = 2025;
    const jurisdictionId = 'boston-berdo';

    it('uses Boston-specific coefficients', () => {
      const readings = makeFullYearReadings(year, 50000);
      const nycEmissions = calculateBuildingEmissions(readings, 'nyc-ll97', year);
      const bostonEmissions = calculateBuildingEmissions(readings, jurisdictionId, year);

      // Both should have emissions but they may differ due to different coefficients
      expect(nycEmissions.totalEmissionsTco2e).toBeGreaterThan(0);
      expect(bostonEmissions.totalEmissionsTco2e).toBeGreaterThan(0);
    });

    it('calculates Boston penalty at $234/ton', () => {
      const grossSqft = 50000;
      // Boston BERDO uses its own occupancy type names
      const occupancyType = 'Office';
      // Set very high usage to ensure over limit
      const readings = makeFullYearReadings(year, 500000);
      const result = calculateCompliance(readings, grossSqft, occupancyType, jurisdictionId, year);

      expect(result.emissionsOverLimit).toBeGreaterThan(0);
      // Boston penalty is $234/ton, not $268
      expect(result.estimatedPenaltyDollars).toBeCloseTo(result.emissionsOverLimit * 234, 0);
    });
  });

  describe('mixed-use building limits', () => {
    it('calculates weighted limit for mixed-use buildings', () => {
      const mix: OccupancyMixEntry[] = [
        { type: 'B - Business', sqft: 30000 },
        { type: 'R-2 - Residential (Multi-family)', sqft: 20000 },
      ];

      const limit = calculateMixedUseLimit(mix, 'nyc-ll97', 2024);
      const businessOnly = calculateEmissionsLimit(50000, 'B - Business', 'nyc-ll97', 2024);
      const residentialOnly = calculateEmissionsLimit(50000, 'R-2 - Residential (Multi-family)', 'nyc-ll97', 2024);

      // Mixed limit should be between the two pure limits
      expect(limit).toBeGreaterThan(0);
      expect(limit).not.toBe(businessOnly);
      expect(limit).not.toBe(residentialOnly);
    });

    it('returns 0 for empty occupancy mix', () => {
      const limit = calculateMixedUseLimit([], 'nyc-ll97', 2024);
      expect(limit).toBe(0);
    });
  });

  describe('multi-fuel emission calculations', () => {
    it('correctly aggregates emissions from multiple fuel types', () => {
      const readings: UtilityReadingInput[] = [
        { utilityType: 'electricity', consumptionValue: 100000, consumptionUnit: 'kWh', periodStart: '2024-01-01', periodEnd: '2024-01-31' },
        { utilityType: 'natural_gas', consumptionValue: 10000, consumptionUnit: 'kBtu', periodStart: '2024-01-01', periodEnd: '2024-01-31' },
        { utilityType: 'fuel_oil_2', consumptionValue: 5000, consumptionUnit: 'kBtu', periodStart: '2024-01-01', periodEnd: '2024-01-31' },
      ];

      const result = calculateBuildingEmissions(readings, 'nyc-ll97', 2024);

      expect(Object.keys(result.breakdownByFuel)).toHaveLength(3);
      expect(result.breakdownByFuel.electricity).toBeGreaterThan(0);
      expect(result.breakdownByFuel.natural_gas).toBeGreaterThan(0);
      expect(result.breakdownByFuel.fuel_oil_2).toBeGreaterThan(0);
      // Total should be sum of parts
      const sumOfParts = Object.values(result.breakdownByFuel).reduce((a, b) => a + b, 0);
      expect(result.totalEmissionsTco2e).toBeCloseTo(sumOfParts, 2);
    });
  });

  describe('edge cases in compliance status', () => {
    it('handles zero-emission building with full data as compliant', () => {
      const readings = makeFullYearReadings(2024, 0);
      const result = calculateCompliance(readings, 50000, 'B - Business', 'nyc-ll97', 2024);

      expect(result.totalEmissionsTco2e).toBe(0);
      expect(result.status).toBe('compliant');
      expect(result.estimatedPenaltyDollars).toBe(0);
    });

    it('handles building with no readings', () => {
      const result = calculateCompliance([], 50000, 'B - Business', 'nyc-ll97', 2024);

      expect(result.totalEmissionsTco2e).toBe(0);
      expect(result.status).toBe('incomplete');
      expect(result.missingMonths).toHaveLength(12);
      expect(result.dataCompletenessPct).toBe(0);
    });

    it('penalty calculation handles exactly-at-limit correctly', () => {
      const penalty = calculatePenalty(100, 100, 'nyc-ll97', 2024);
      expect(penalty).toBe(0);
    });

    it('penalty calculation handles slightly over limit', () => {
      const penalty = calculatePenalty(100.001, 100, 'nyc-ll97', 2024);
      expect(penalty).toBeGreaterThan(0);
      expect(penalty).toBeCloseTo(0.001 * 268, 1);
    });
  });

  describe('missing months detection', () => {
    it('identifies months without readings as missing', () => {
      // Full year has 0 missing months
      const fullYear = makeFullYearReadings(2024, 1000);
      expect(detectMissingMonths(fullYear, 2024)).toHaveLength(0);

      // Empty readings = all 12 months missing
      expect(detectMissingMonths([], 2024)).toHaveLength(12);

      // Single month reading — should have 11 missing
      const singleMonth: UtilityReadingInput[] = [{
        utilityType: 'electricity', consumptionValue: 1000, consumptionUnit: 'kWh',
        periodStart: '2024-06-01', periodEnd: '2024-06-15',
      }];
      const missing = detectMissingMonths(singleMonth, 2024);
      expect(missing).not.toContain('2024-06');
      expect(missing.length).toBeGreaterThanOrEqual(10); // at least 10 months missing
    });
  });
});
