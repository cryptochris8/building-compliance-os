import { describe, it, expect } from 'vitest';
import { generateCsvTemplate, generateSampleRows, CSV_HEADERS } from '../template';

describe('CSV_HEADERS', () => {
  it('has 7 entries', () => {
    expect(CSV_HEADERS).toHaveLength(7);
  });

  it('contains the expected header names', () => {
    expect(CSV_HEADERS).toEqual([
      'utility_type',
      'account_number',
      'period_start',
      'period_end',
      'consumption_value',
      'consumption_unit',
      'cost_usd',
    ]);
  });
});

describe('generateSampleRows', () => {
  it('returns 4 sample rows', () => {
    const rows = generateSampleRows();
    expect(rows).toHaveLength(4);
  });

  it('each row has all required fields', () => {
    const rows = generateSampleRows();
    for (const row of rows) {
      for (const header of CSV_HEADERS) {
        expect(row[header]).toBeDefined();
        expect(typeof row[header]).toBe('string');
        expect(row[header].length).toBeGreaterThan(0);
      }
    }
  });

  it('includes different utility types', () => {
    const rows = generateSampleRows();
    const types = rows.map((r) => r.utility_type);
    expect(types).toContain('electricity');
    expect(types).toContain('natural_gas');
  });
});

describe('generateCsvTemplate', () => {
  it('returns a string with correct headers on the first line', () => {
    const csv = generateCsvTemplate();
    const lines = csv.split('\n');
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
  });

  it('includes header line plus 4 data lines', () => {
    const csv = generateCsvTemplate();
    const lines = csv.split('\n');
    expect(lines).toHaveLength(5); // 1 header + 4 data rows
  });

  it('each data line has 7 comma-separated fields', () => {
    const csv = generateCsvTemplate();
    const lines = csv.split('\n');
    for (const line of lines.slice(1)) {
      const fields = line.split(',');
      expect(fields).toHaveLength(7);
    }
  });
});
