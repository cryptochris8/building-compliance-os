import { describe, it, expect } from 'vitest';
import {
  getJurisdiction,
  listJurisdictions,
  nycLL97,
  bostonBERDO,
} from '../index';

// ===========================================================================
// getJurisdiction
// ===========================================================================
describe('getJurisdiction', () => {
  it('returns valid config for nyc-ll97', () => {
    const config = getJurisdiction('nyc-ll97');
    expect(config.id).toBe('nyc-ll97');
    expect(config.name).toBe('NYC Local Law 97');
    expect(config.periods.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(config.periods[0].limits).length).toBeGreaterThan(0);
  });

  it('returns valid config for boston-berdo', () => {
    const config = getJurisdiction('boston-berdo');
    expect(config.id).toBe('boston-berdo');
    expect(config.name).toBe('Boston BERDO 2.0');
    expect(config.periods.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(config.periods[0].limits).length).toBeGreaterThan(0);
  });

  it('throws error for unknown jurisdiction', () => {
    expect(() => getJurisdiction('unknown')).toThrowError('Unknown jurisdiction: unknown');
  });

  it('throws error for empty string', () => {
    expect(() => getJurisdiction('')).toThrowError('Unknown jurisdiction: ');
  });
});

// ===========================================================================
// listJurisdictions
// ===========================================================================
describe('listJurisdictions', () => {
  it('returns array with at least 2 entries', () => {
    const list = listJurisdictions();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('includes NYC LL97 in the list', () => {
    const list = listJurisdictions();
    const nyc = list.find((j) => j.id === 'nyc-ll97');
    expect(nyc).toBeDefined();
    expect(nyc!.name).toBe('NYC Local Law 97');
  });

  it('includes Boston BERDO in the list', () => {
    const list = listJurisdictions();
    const boston = list.find((j) => j.id === 'boston-berdo');
    expect(boston).toBeDefined();
    expect(boston!.name).toBe('Boston BERDO 2.0');
  });

  it('each entry has id and name', () => {
    const list = listJurisdictions();
    for (const entry of list) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// NYC LL97 specifics
// ===========================================================================
describe('NYC LL97 config', () => {
  it('has correct penalty rate of $268/ton', () => {
    expect(nycLL97.periods[0].penaltyPerTon).toBe(268);
  });

  it('all periods have $268/ton penalty', () => {
    for (const period of nycLL97.periods) {
      expect(period.penaltyPerTon).toBe(268);
    }
  });

  it('has a reporting deadline', () => {
    expect(nycLL97.reportingDeadline).toBeDefined();
    expect(nycLL97.reportingDeadline.month).toBe(5);
    expect(nycLL97.reportingDeadline.day).toBe(1);
  });

  it('has correct city and state', () => {
    expect(nycLL97.city).toBe('New York');
    expect(nycLL97.state).toBe('NY');
  });

  it('has a 25,000 sqft threshold', () => {
    expect(nycLL97.thresholdSqft).toBe(25000);
  });

  it('has occupancy types in its limits', () => {
    const limits = nycLL97.periods[0].limits;
    expect(limits['B - Business']).toBeDefined();
    expect(limits['R-2 - Residential (Multi-family)']).toBeDefined();
  });

  it('has carbon coefficients', () => {
    const coeff = nycLL97.periods[0].coefficients;
    expect(coeff.electricity_kwh).toBeGreaterThan(0);
    expect(coeff.natural_gas_kbtu).toBeGreaterThan(0);
  });

  it('has two compliance periods', () => {
    expect(nycLL97.periods).toHaveLength(2);
    expect(nycLL97.periods[0].startYear).toBe(2024);
    expect(nycLL97.periods[0].endYear).toBe(2029);
    expect(nycLL97.periods[1].startYear).toBe(2030);
    expect(nycLL97.periods[1].endYear).toBe(2034);
  });
});

// ===========================================================================
// Boston BERDO specifics
// ===========================================================================
describe('Boston BERDO config', () => {
  it('has correct penalty rate of $234/ton', () => {
    expect(bostonBERDO.periods[0].penaltyPerTon).toBe(234);
  });

  it('all periods have $234/ton penalty', () => {
    for (const period of bostonBERDO.periods) {
      expect(period.penaltyPerTon).toBe(234);
    }
  });

  it('has a reporting deadline', () => {
    expect(bostonBERDO.reportingDeadline).toBeDefined();
    expect(bostonBERDO.reportingDeadline.month).toBe(9);
    expect(bostonBERDO.reportingDeadline.day).toBe(15);
  });

  it('has correct city and state', () => {
    expect(bostonBERDO.city).toBe('Boston');
    expect(bostonBERDO.state).toBe('MA');
  });

  it('has a 20,000 sqft threshold', () => {
    expect(bostonBERDO.thresholdSqft).toBe(20000);
  });

  it('has occupancy types in its limits', () => {
    const limits = bostonBERDO.periods[0].limits;
    expect(limits['Office']).toBeDefined();
    expect(limits['Multifamily Housing']).toBeDefined();
  });

  it('has carbon coefficients', () => {
    const coeff = bostonBERDO.periods[0].coefficients;
    expect(coeff.electricity_kwh).toBeGreaterThan(0);
    expect(coeff.natural_gas_kbtu).toBeGreaterThan(0);
  });

  it('has two compliance periods', () => {
    expect(bostonBERDO.periods).toHaveLength(2);
    expect(bostonBERDO.periods[0].startYear).toBe(2025);
    expect(bostonBERDO.periods[1].startYear).toBe(2030);
  });
});
