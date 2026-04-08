import { describe, it, expect } from 'vitest';
import { UTILITY_TYPE_LABELS } from '../utility-labels';

describe('UTILITY_TYPE_LABELS', () => {
  it('has labels for all five utility types', () => {
    expect(Object.keys(UTILITY_TYPE_LABELS)).toHaveLength(5);
    expect(UTILITY_TYPE_LABELS.electricity).toBe('Electricity');
    expect(UTILITY_TYPE_LABELS.natural_gas).toBe('Natural Gas');
    expect(UTILITY_TYPE_LABELS.district_steam).toBe('District Steam');
    expect(UTILITY_TYPE_LABELS.fuel_oil_2).toBe('Fuel Oil #2');
    expect(UTILITY_TYPE_LABELS.fuel_oil_4).toBe('Fuel Oil #4');
  });

  it('all values are non-empty strings', () => {
    for (const label of Object.values(UTILITY_TYPE_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
