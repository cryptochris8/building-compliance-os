import { describe, it, expect } from 'vitest';
import { detectGaps, getMonthName } from '../gap-detector';

describe('getMonthName', () => {
  it('returns correct month names', () => {
    expect(getMonthName(1)).toBe('January');
    expect(getMonthName(6)).toBe('June');
    expect(getMonthName(12)).toBe('December');
  });

  it('returns fallback for out-of-range month', () => {
    expect(getMonthName(0)).toBe('Month 0');
    expect(getMonthName(13)).toBe('Month 13');
  });
});

describe('detectGaps', () => {
  it('returns 0% completeness with no accounts', () => {
    const report = detectGaps('b1', 2024, [], []);
    expect(report.overallCompleteness).toBe(0);
    expect(report.accounts).toHaveLength(0);
  });

  it('returns 0% completeness with accounts but no readings', () => {
    const report = detectGaps(
      'b1', 2024,
      [{ id: 'a1', utilityType: 'electricity' }],
      []
    );
    expect(report.overallCompleteness).toBe(0);
    expect(report.accounts[0].missingMonths).toHaveLength(12);
    expect(report.accounts[0].completeness).toBe(0);
  });

  it('returns 100% completeness with all 12 months covered', () => {
    const readings = [];
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(2024, m, 0).getDate();
      readings.push({
        utilityAccountId: 'a1',
        periodStart: `2024-${month}-01`,
        periodEnd: `2024-${month}-${String(lastDay).padStart(2, '0')}`,
      });
    }

    const report = detectGaps(
      'b1', 2024,
      [{ id: 'a1', utilityType: 'electricity' }],
      readings
    );
    expect(report.overallCompleteness).toBe(100);
    expect(report.accounts[0].missingMonths).toHaveLength(0);
  });

  it('correctly identifies missing months', () => {
    // Use only months with gaps that won't be affected by timezone edge cases
    const readings = [
      { utilityAccountId: 'a1', periodStart: '2024-03-15', periodEnd: '2024-03-31' },
      { utilityAccountId: 'a1', periodStart: '2024-06-15', periodEnd: '2024-06-30' },
    ];

    const report = detectGaps(
      'b1', 2024,
      [{ id: 'a1', utilityType: 'electricity' }],
      readings
    );
    // March and June should be covered; check some missing months
    expect(report.accounts[0].missingMonths).not.toContain(3); // Mar present
    expect(report.accounts[0].missingMonths).not.toContain(6); // Jun present
    expect(report.accounts[0].missingMonths).toContain(4); // Apr missing
    expect(report.accounts[0].missingMonths).toContain(7); // Jul missing
    expect(report.accounts[0].missingMonths).toContain(8); // Aug missing
    expect(report.accounts[0].completeness).toBeGreaterThan(0);
    expect(report.accounts[0].completeness).toBeLessThan(100);
  });

  it('handles multi-month readings spanning across months', () => {
    const readings = [
      { utilityAccountId: 'a1', periodStart: '2024-01-01', periodEnd: '2024-03-31' },
    ];

    const report = detectGaps(
      'b1', 2024,
      [{ id: 'a1', utilityType: 'electricity' }],
      readings
    );
    expect(report.accounts[0].missingMonths).not.toContain(1);
    expect(report.accounts[0].missingMonths).not.toContain(2);
    expect(report.accounts[0].missingMonths).not.toContain(3);
    expect(report.accounts[0].completeness).toBe(25); // 3/12
  });

  it('ignores readings from other years', () => {
    const readings = [
      { utilityAccountId: 'a1', periodStart: '2023-06-01', periodEnd: '2023-06-30' },
    ];

    const report = detectGaps(
      'b1', 2024,
      [{ id: 'a1', utilityType: 'electricity' }],
      readings
    );
    expect(report.accounts[0].missingMonths).toHaveLength(12);
  });

  it('averages completeness across multiple accounts', () => {
    const readings = [];
    // Account 1: all 12 months (100%)
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, '0');
      const lastDay = new Date(2024, m, 0).getDate();
      readings.push({
        utilityAccountId: 'a1',
        periodStart: `2024-${month}-01`,
        periodEnd: `2024-${month}-${String(lastDay).padStart(2, '0')}`,
      });
    }
    // Account 2: no readings (0%)

    const report = detectGaps(
      'b1', 2024,
      [
        { id: 'a1', utilityType: 'electricity' },
        { id: 'a2', utilityType: 'natural_gas' },
      ],
      readings
    );
    expect(report.overallCompleteness).toBe(50); // (100 + 0) / 2
  });

  it('ignores readings for other accounts', () => {
    const readings = [
      { utilityAccountId: 'a2', periodStart: '2024-01-01', periodEnd: '2024-01-31' },
    ];

    const report = detectGaps(
      'b1', 2024,
      [{ id: 'a1', utilityType: 'electricity' }],
      readings
    );
    expect(report.accounts[0].missingMonths).toHaveLength(12);
  });
});
