import { describe, it, expect } from 'vitest';
import { FUEL_COLORS, FUEL_LABELS } from '../chart-constants';

describe('FUEL_COLORS', () => {
  it('has colors for all standard fuel types', () => {
    expect(FUEL_COLORS.electricity).toBe('#3b82f6');
    expect(FUEL_COLORS.natural_gas).toBe('#f97316');
    expect(FUEL_COLORS.district_steam).toBe('#8b5cf6');
    expect(FUEL_COLORS.fuel_oil_2).toBe('#ef4444');
    expect(FUEL_COLORS.fuel_oil_4).toBe('#f43f5e');
  });

  it('has a combined fuel_oil alias', () => {
    expect(FUEL_COLORS.fuel_oil).toBe('#ef4444');
  });

  it('all values are valid hex colors', () => {
    for (const color of Object.values(FUEL_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('FUEL_LABELS', () => {
  it('has labels for all standard fuel types', () => {
    expect(FUEL_LABELS.electricity).toBe('Electricity');
    expect(FUEL_LABELS.natural_gas).toBe('Natural Gas');
    expect(FUEL_LABELS.district_steam).toBe('District Steam');
    expect(FUEL_LABELS.fuel_oil_2).toBe('Fuel Oil #2');
    expect(FUEL_LABELS.fuel_oil_4).toBe('Fuel Oil #4');
  });

  it('has a combined fuel_oil alias', () => {
    expect(FUEL_LABELS.fuel_oil).toBe('Fuel Oil');
  });

  it('every key in FUEL_COLORS has a corresponding label', () => {
    for (const key of Object.keys(FUEL_COLORS)) {
      expect(FUEL_LABELS[key]).toBeDefined();
    }
  });
});
