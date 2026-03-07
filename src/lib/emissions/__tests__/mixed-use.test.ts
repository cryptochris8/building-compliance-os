import { describe, it, expect } from 'vitest';
import { calculateMixedUseLimit, validateOccupancyMix } from '../mixed-use';

describe('calculateMixedUseLimit', () => {
  const JURISDICTION = 'nyc-ll97';
  const YEAR = 2024;

  it('calculates weighted limit for two occupancy types', () => {
    const mix = [
      { type: 'B - Business', sqft: 30000 },
      { type: 'R-2 - Residential (Multi-family)', sqft: 20000 },
    ];

    const limit = calculateMixedUseLimit(mix, JURISDICTION, YEAR);
    // 30000 * 0.00846 + 20000 * 0.00675 = 253.8 + 135 = 388.8
    expect(limit).toBeCloseTo(388.8, 1);
  });

  it('matches single-use limit when only one type', () => {
    const mix = [{ type: 'B - Business', sqft: 50000 }];
    const limit = calculateMixedUseLimit(mix, JURISDICTION, YEAR);
    expect(limit).toBeCloseTo(50000 * 0.00846, 2);
  });

  it('uses stricter limits in 2030-2034 period', () => {
    const mix = [
      { type: 'B - Business', sqft: 30000 },
      { type: 'M - Mercantile', sqft: 20000 },
    ];

    const limit2024 = calculateMixedUseLimit(mix, JURISDICTION, 2024);
    const limit2030 = calculateMixedUseLimit(mix, JURISDICTION, 2030);
    expect(limit2030).toBeLessThan(limit2024);
  });

  it('throws for invalid occupancy type', () => {
    const mix = [{ type: 'Z - Nonexistent', sqft: 50000 }];
    expect(() => calculateMixedUseLimit(mix, JURISDICTION, YEAR)).toThrow(
      'No emissions limit found'
    );
  });

  it('throws for unknown jurisdiction', () => {
    const mix = [{ type: 'B - Business', sqft: 50000 }];
    expect(() => calculateMixedUseLimit(mix, 'unknown', YEAR)).toThrow(
      'Unknown jurisdiction'
    );
  });
});

describe('validateOccupancyMix', () => {
  it('validates when mix totals match gross sqft', () => {
    const mix = [
      { type: 'B - Business', sqft: 30000 },
      { type: 'R-2 - Residential (Multi-family)', sqft: 20000 },
    ];
    const result = validateOccupancyMix(mix, 50000);
    expect(result.valid).toBe(true);
    expect(result.totalMixSqft).toBe(50000);
    expect(result.difference).toBe(0);
  });

  it('fails when mix totals do not match', () => {
    const mix = [
      { type: 'B - Business', sqft: 30000 },
      { type: 'R-2 - Residential (Multi-family)', sqft: 10000 },
    ];
    const result = validateOccupancyMix(mix, 50000);
    expect(result.valid).toBe(false);
    expect(result.difference).toBe(10000);
  });

  it('respects custom tolerance', () => {
    const mix = [{ type: 'B - Business', sqft: 49995 }];
    const result = validateOccupancyMix(mix, 50000, 10);
    expect(result.valid).toBe(true);
  });

  it('uses default tolerance of 1 sqft', () => {
    const mix = [{ type: 'B - Business', sqft: 49999 }];
    const result = validateOccupancyMix(mix, 50000);
    expect(result.valid).toBe(true);

    const mix2 = [{ type: 'B - Business', sqft: 49998 }];
    const result2 = validateOccupancyMix(mix2, 50000);
    expect(result2.valid).toBe(false);
  });
});
