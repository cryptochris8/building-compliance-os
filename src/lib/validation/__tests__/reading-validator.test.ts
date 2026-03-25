import { describe, it, expect } from 'vitest';
import { validateReading, type ReadingInput, type ExistingReading } from '../reading-validator';

function makeReading(overrides: Partial<ReadingInput> = {}): ReadingInput {
  return {
    utilityAccountId: 'acc-1',
    utilityType: 'electricity',
    periodStart: '2024-01-01',
    periodEnd: '2024-01-31',
    consumptionValue: 45000,
    consumptionUnit: 'kwh',
    ...overrides,
  };
}

describe('validateReading', () => {
  it('returns valid for a correct reading with no existing readings', () => {
    const result = validateReading(makeReading(), []);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // Rule 1: Negative values
  it('flags negative consumption value as error', () => {
    const result = validateReading(makeReading({ consumptionValue: -100 }), []);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'NEGATIVE_VALUE', severity: 'error' })
    );
  });

  it('allows zero consumption value', () => {
    const result = validateReading(makeReading({ consumptionValue: 0 }), []);
    expect(result.valid).toBe(true);
  });

  // Rule 2: Date range validation
  it('flags start >= end as error', () => {
    const result = validateReading(
      makeReading({ periodStart: '2024-01-31', periodEnd: '2024-01-01' }),
      []
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_DATE_RANGE', severity: 'error' })
    );
  });

  it('flags same start and end dates as error', () => {
    const result = validateReading(
      makeReading({ periodStart: '2024-01-15', periodEnd: '2024-01-15' }),
      []
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_DATE_RANGE' })
    );
  });

  it('flags invalid start date', () => {
    const result = validateReading(makeReading({ periodStart: 'invalid' }), []);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_START_DATE' })
    );
  });

  it('flags invalid end date', () => {
    const result = validateReading(makeReading({ periodEnd: 'invalid' }), []);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_END_DATE' })
    );
  });

  // Rule 3: Future dates (warning only)
  it('warns about future end date', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const result = validateReading(
      makeReading({ periodEnd: futureDate.toISOString().split('T')[0] }),
      []
    );
    expect(result.valid).toBe(true); // warning, not error
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'FUTURE_DATE', severity: 'warning' })
    );
  });

  // Rule 4: Duplicate detection
  it('flags duplicate reading for same account + period', () => {
    const existing: ExistingReading[] = [
      {
        id: 'existing-1',
        utilityAccountId: 'acc-1',
        utilityType: 'electricity',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        consumptionValue: 40000,
        consumptionUnit: 'kwh',
      },
    ];
    const result = validateReading(makeReading(), existing);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_READING', severity: 'error' })
    );
  });

  it('allows reading for different account', () => {
    const existing: ExistingReading[] = [
      {
        id: 'existing-1',
        utilityAccountId: 'acc-2',
        utilityType: 'electricity',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        consumptionValue: 40000,
        consumptionUnit: 'kwh',
      },
    ];
    const result = validateReading(makeReading(), existing);
    expect(result.valid).toBe(true);
  });

  // Rule 5: Outlier detection
  it('warns about outliers (>3x average) when 3+ existing readings', () => {
    const existing: ExistingReading[] = [
      { id: '1', utilityAccountId: 'acc-1', utilityType: 'electricity', periodStart: '2024-02-01', periodEnd: '2024-02-28', consumptionValue: 1000, consumptionUnit: 'kwh' },
      { id: '2', utilityAccountId: 'acc-1', utilityType: 'electricity', periodStart: '2024-03-01', periodEnd: '2024-03-31', consumptionValue: 1000, consumptionUnit: 'kwh' },
      { id: '3', utilityAccountId: 'acc-1', utilityType: 'electricity', periodStart: '2024-04-01', periodEnd: '2024-04-30', consumptionValue: 1000, consumptionUnit: 'kwh' },
    ];
    const result = validateReading(makeReading({ consumptionValue: 5000 }), existing);
    expect(result.valid).toBe(true); // outlier is a warning, not error
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'OUTLIER_DETECTED', severity: 'warning' })
    );
  });

  it('does not flag outliers with fewer than 3 existing readings', () => {
    const existing: ExistingReading[] = [
      { id: '1', utilityAccountId: 'acc-1', utilityType: 'electricity', periodStart: '2024-02-01', periodEnd: '2024-02-28', consumptionValue: 100, consumptionUnit: 'kwh' },
    ];
    const result = validateReading(makeReading({ consumptionValue: 50000 }), existing);
    expect(result.issues.find((i) => i.code === 'OUTLIER_DETECTED')).toBeUndefined();
  });

  it('does not flag value at exactly 3x average', () => {
    const existing: ExistingReading[] = [
      { id: '1', utilityAccountId: 'acc-1', utilityType: 'electricity', periodStart: '2024-02-01', periodEnd: '2024-02-28', consumptionValue: 1000, consumptionUnit: 'kwh' },
      { id: '2', utilityAccountId: 'acc-1', utilityType: 'electricity', periodStart: '2024-03-01', periodEnd: '2024-03-31', consumptionValue: 1000, consumptionUnit: 'kwh' },
      { id: '3', utilityAccountId: 'acc-1', utilityType: 'electricity', periodStart: '2024-04-01', periodEnd: '2024-04-30', consumptionValue: 1000, consumptionUnit: 'kwh' },
    ];
    const result = validateReading(makeReading({ consumptionValue: 3000 }), existing);
    expect(result.issues.find((i) => i.code === 'OUTLIER_DETECTED')).toBeUndefined();
  });

  // Rule 6: Unit consistency
  it('warns about mismatched units', () => {
    const result = validateReading(
      makeReading({ utilityType: 'electricity', consumptionUnit: 'therms' }),
      []
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'UNIT_MISMATCH', severity: 'warning' })
    );
  });

  it('accepts kbtu for any utility type', () => {
    const result = validateReading(
      makeReading({ utilityType: 'electricity', consumptionUnit: 'kbtu' }),
      []
    );
    expect(result.issues.find((i) => i.code === 'UNIT_MISMATCH')).toBeUndefined();
  });

  it('accepts expected unit for natural_gas', () => {
    const result = validateReading(
      makeReading({ utilityType: 'natural_gas', consumptionUnit: 'therms' }),
      []
    );
    expect(result.issues.find((i) => i.code === 'UNIT_MISMATCH')).toBeUndefined();
  });

  // Multiple issues
  it('accumulates multiple issues', () => {
    const result = validateReading(
      makeReading({ consumptionValue: -100, periodStart: 'invalid', periodEnd: 'invalid' }),
      []
    );
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
