import { describe, it, expect } from 'vitest';
import { assessConfidenceFromData } from '../confidence-utils';

type Reading = { confidence: string | null; periodStart: string; periodEnd: string };

function makeFullYearReadings(
  year: number,
  confidence: string | null = 'confirmed'
): Reading[] {
  const readings: Reading[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = String(m).padStart(2, '0');
    const lastDay = new Date(year, m, 0).getDate();
    readings.push({
      confidence,
      periodStart: `${year}-${month}-01`,
      periodEnd: `${year}-${month}-${lastDay}`,
    });
  }
  return readings;
}

// ============================================================
// High Confidence Tests
// ============================================================

describe('assessConfidenceFromData', () => {
  const YEAR = 2024;

  it('returns high confidence for full year of confirmed readings', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    const result = assessConfidenceFromData(readings, YEAR);

    expect(result.level).toBe('high');
    expect(result.reasons).toEqual(['All data is confirmed with full year coverage']);
  });

  it('returns high confidence when confidence is null but full year coverage', () => {
    const readings = makeFullYearReadings(YEAR, null);
    const result = assessConfidenceFromData(readings, YEAR);

    expect(result.level).toBe('high');
    expect(result.reasons).toEqual(['All data is confirmed with full year coverage']);
  });

  // ============================================================
  // Medium Confidence Tests
  // ============================================================

  it('returns medium confidence for 95% completeness (between 75% and 95%)', () => {
    // 11 months = 91.67% completeness → medium
    const readings: Reading[] = [];
    for (let m = 1; m <= 11; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(YEAR, m, 0).getDate();
      readings.push({
        confidence: 'confirmed',
        periodStart: `${YEAR}-${month}-01`,
        periodEnd: `${YEAR}-${month}-${lastDay}`,
      });
    }

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.level).toBe('medium');
    expect(result.reasons[0]).toContain('between 75% and 95%');
  });

  it('returns medium confidence for estimated readings when not low', () => {
    const readings = makeFullYearReadings(YEAR, 'estimated');
    const result = assessConfidenceFromData(readings, YEAR);

    expect(result.level).toBe('medium');
    expect(result.reasons).toContainEqual(
      expect.stringContaining('estimated (not confirmed)')
    );
  });

  it('returns medium for single estimated reading with full coverage', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    readings[0].confidence = 'estimated';
    const result = assessConfidenceFromData(readings, YEAR);

    expect(result.level).toBe('medium');
    expect(result.reasons).toContainEqual(
      expect.stringContaining('1 reading is estimated')
    );
  });

  it('returns medium for multiple estimated readings with full coverage', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    readings[0].confidence = 'estimated';
    readings[1].confidence = 'estimated';
    const result = assessConfidenceFromData(readings, YEAR);

    expect(result.level).toBe('medium');
    expect(result.reasons).toContainEqual(
      expect.stringContaining('2 readings are estimated')
    );
  });

  // ============================================================
  // Low Confidence Tests
  // ============================================================

  it('returns low confidence when completeness is below 75%', () => {
    // 8 months = 66.67% < 75%
    const readings: Reading[] = [];
    for (let m = 1; m <= 8; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(YEAR, m, 0).getDate();
      readings.push({
        confidence: 'confirmed',
        periodStart: `${YEAR}-${month}-01`,
        periodEnd: `${YEAR}-${month}-${lastDay}`,
      });
    }

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.level).toBe('low');
    expect(result.reasons[0]).toContain('less than 75% threshold');
  });

  it('returns low confidence for empty readings array', () => {
    const result = assessConfidenceFromData([], YEAR);

    expect(result.level).toBe('low');
    expect(result.reasons).toContainEqual('No utility readings found for this year');
  });

  it('returns low confidence when any readings are flagged', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    readings[0].confidence = 'flagged';

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.level).toBe('low');
    expect(result.reasons).toContainEqual(
      expect.stringContaining('flagged for review')
    );
  });

  it('returns low with singular grammar for 1 flagged reading', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    readings[0].confidence = 'flagged';

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.reasons).toContainEqual(
      expect.stringContaining('1 reading is flagged')
    );
  });

  it('returns low with plural grammar for multiple flagged readings', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    readings[0].confidence = 'flagged';
    readings[1].confidence = 'flagged';

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.reasons).toContainEqual(
      expect.stringContaining('2 readings are flagged')
    );
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  it('flagged overrides estimated — level stays low', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    readings[0].confidence = 'flagged';
    readings[1].confidence = 'estimated';

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.level).toBe('low');
  });

  it('handles multi-month reading spans', () => {
    // A single reading covering all 12 months
    const readings: Reading[] = [
      {
        confidence: 'confirmed',
        periodStart: `${YEAR}-01-01`,
        periodEnd: `${YEAR}-12-31`,
      },
    ];

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.level).toBe('high');
  });

  it('only counts months from the target year', () => {
    // Reading covers Dec 2023 through Jun 2024 — only 6 months count for 2024
    const readings: Reading[] = [
      {
        confidence: 'confirmed',
        periodStart: '2023-12-01',
        periodEnd: `${YEAR}-06-30`,
      },
    ];

    const result = assessConfidenceFromData(readings, YEAR);
    // 6/12 = 50% → low
    expect(result.level).toBe('low');
    expect(result.reasons[0]).toContain('less than 75% threshold');
  });

  it('exactly 75% completeness is medium, not low', () => {
    // 9 months = exactly 75%
    const readings: Reading[] = [];
    for (let m = 1; m <= 9; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(YEAR, m, 0).getDate();
      readings.push({
        confidence: 'confirmed',
        periodStart: `${YEAR}-${month}-01`,
        periodEnd: `${YEAR}-${month}-${lastDay}`,
      });
    }

    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.level).toBe('medium');
    expect(result.reasons[0]).toContain('between 75% and 95%');
  });

  it('exactly 100% completeness is high (above 95%)', () => {
    const readings = makeFullYearReadings(YEAR, 'confirmed');
    const result = assessConfidenceFromData(readings, YEAR);
    expect(result.level).toBe('high');
  });
});
