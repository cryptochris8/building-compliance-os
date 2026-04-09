import { describe, it, expect } from 'vitest';
import { FUEL_COLORS, FUEL_LABELS } from '../chart-constants';

describe('FUEL_COLORS', () => {
  it('has colors for all standard fuel types', () => {
    expect(FUEL_COLORS.electricity).toBeDefined();
    expect(FUEL_COLORS.natural_gas).toBeDefined();
    expect(FUEL_COLORS.district_steam).toBeDefined();
    expect(FUEL_COLORS.fuel_oil_2).toBeDefined();
    expect(FUEL_COLORS.fuel_oil_4).toBeDefined();
  });

  it('has a combined fuel_oil alias', () => {
    expect(FUEL_COLORS.fuel_oil).toBeDefined();
    // The alias should resolve to the same value as fuel_oil_2
    expect(FUEL_COLORS.fuel_oil).toBe(FUEL_COLORS.fuel_oil_2);
  });

  it('all values reference a CSS custom property or are valid hex colors', () => {
    const cssVarOrHex = /^(var\(--[a-z0-9-]+(?:,\s*#[0-9a-f]{3,8})?\)|#[0-9a-f]{6})$/i;
    for (const color of Object.values(FUEL_COLORS)) {
      expect(color).toMatch(cssVarOrHex);
    }
  });

  it('uses distinct chart variable references for each fuel type', () => {
    // Each fuel type should map to a distinct chart variable so colours are
    // unique across the chart legend.
    const distinctValues = new Set(Object.values(FUEL_COLORS));
    // We have 5 named fuels + 1 alias; expect at least 5 distinct colours
    expect(distinctValues.size).toBeGreaterThanOrEqual(5);
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
