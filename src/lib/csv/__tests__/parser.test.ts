import { describe, it, expect } from 'vitest';
import { parseCsv, validateCsvHeaders } from '../parser';

describe('parseCsv', () => {
  it('parses simple CSV with headers and rows', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = parseCsv(csv);
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ name: 'Alice', age: '30' });
    expect(result.rows[1]).toEqual({ name: 'Bob', age: '25' });
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for empty CSV', () => {
    const result = parseCsv('');
    expect(result.headers).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('CSV file is empty');
  });

  it('handles headers-only CSV', () => {
    const result = parseCsv('name,age');
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles quoted fields with commas inside', () => {
    const csv = 'name,address\nAlice,"123 Main St, Apt 4"';
    const result = parseCsv(csv);
    expect(result.rows[0].address).toBe('123 Main St, Apt 4');
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const csv = 'name,desc\nAlice,"She said ""hello""!"';
    const result = parseCsv(csv);
    expect(result.rows[0].desc).toBe('She said "hello"!');
  });

  it('handles CRLF line endings', () => {
    const csv = 'name,age\r\nAlice,30\r\nBob,25';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('skips empty lines', () => {
    const csv = 'name,age\n\nAlice,30\n\nBob,25\n';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('reports error for mismatched column count', () => {
    const csv = 'name,age\nAlice,30,extra\nBob,25';
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(1); // Only Bob parsed successfully
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain('Expected 2 fields but found 3');
  });

  it('lowercases header names', () => {
    const csv = 'Name,AGE\nAlice,30';
    const result = parseCsv(csv);
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows[0]).toEqual({ name: 'Alice', age: '30' });
  });

  it('trims whitespace from fields', () => {
    const csv = ' name , age \n Alice , 30 ';
    const result = parseCsv(csv);
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows[0]).toEqual({ name: 'Alice', age: '30' });
  });
});

describe('validateCsvHeaders', () => {
  it('returns empty array when all required headers are present', () => {
    const headers = ['utility_type', 'account_number', 'period_start', 'period_end', 'consumption_value', 'consumption_unit'];
    expect(validateCsvHeaders(headers)).toEqual([]);
  });

  it('returns missing headers', () => {
    const headers = ['utility_type', 'period_start'];
    const missing = validateCsvHeaders(headers);
    expect(missing).toContain('account_number');
    expect(missing).toContain('period_end');
    expect(missing).toContain('consumption_value');
    expect(missing).toContain('consumption_unit');
    expect(missing).not.toContain('utility_type');
    expect(missing).not.toContain('period_start');
  });

  it('returns all required headers when given empty array', () => {
    const missing = validateCsvHeaders([]);
    expect(missing).toHaveLength(6);
  });

  it('is case-insensitive', () => {
    const headers = ['utility_type', 'account_number', 'period_start', 'period_end', 'consumption_value', 'consumption_unit'];
    expect(validateCsvHeaders(headers)).toEqual([]);
  });
});
