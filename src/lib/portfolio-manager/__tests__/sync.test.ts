import { describe, it, expect, vi } from 'vitest';

// Mock all heavy dependencies so the module can load
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  utilityAccounts: {},
  utilityReadings: {},
  pmConnections: {},
  pmPropertyMappings: {},
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock('../client', () => ({ PMClient: vi.fn() }));
vi.mock('@/lib/auth/encryption', () => ({ decrypt: vi.fn() }));

import { mapPMToLocalUtilityType, mapPMToLocalUnit } from '../sync';

describe('mapPMToLocalUtilityType', () => {
  it('maps "Electric" to electricity', () => {
    expect(mapPMToLocalUtilityType('Electric')).toBe('electricity');
  });

  it('maps "Electric - Grid" to electricity', () => {
    expect(mapPMToLocalUtilityType('Electric - Grid')).toBe('electricity');
  });

  it('maps "Electric - Grid Purchase" to electricity', () => {
    expect(mapPMToLocalUtilityType('Electric - Grid Purchase')).toBe('electricity');
  });

  it('maps "Natural Gas" to natural_gas', () => {
    expect(mapPMToLocalUtilityType('Natural Gas')).toBe('natural_gas');
  });

  it('maps "District Steam" to district_steam', () => {
    expect(mapPMToLocalUtilityType('District Steam')).toBe('district_steam');
  });

  it('maps "Fuel Oil (No. 2)" to fuel_oil_2', () => {
    expect(mapPMToLocalUtilityType('Fuel Oil (No. 2)')).toBe('fuel_oil_2');
  });

  it('maps "Fuel Oil (No. 4)" to fuel_oil_4', () => {
    expect(mapPMToLocalUtilityType('Fuel Oil (No. 4)')).toBe('fuel_oil_4');
  });

  it('returns electricity for unknown type', () => {
    expect(mapPMToLocalUtilityType('Solar Thermal')).toBe('electricity');
  });
});

describe('mapPMToLocalUnit', () => {
  it('maps "kWh (thousand Watt-hours)" to kwh with factor 1', () => {
    const result = mapPMToLocalUnit('kWh (thousand Watt-hours)');
    expect(result.unit).toBe('kwh');
    expect(result.conversionFactor).toBe(1);
  });

  it('maps "kWh" to kwh with factor 1', () => {
    const result = mapPMToLocalUnit('kWh');
    expect(result.unit).toBe('kwh');
    expect(result.conversionFactor).toBe(1);
  });

  it('maps "therms" to therms with factor 1', () => {
    const result = mapPMToLocalUnit('therms');
    expect(result.unit).toBe('therms');
    expect(result.conversionFactor).toBe(1);
  });

  it('maps "Gallons (US)" to gallons with factor 1', () => {
    const result = mapPMToLocalUnit('Gallons (US)');
    expect(result.unit).toBe('gallons');
    expect(result.conversionFactor).toBe(1);
  });

  it('maps "GJ" to kbtu with conversion factor 947.817', () => {
    const result = mapPMToLocalUnit('GJ');
    expect(result.unit).toBe('kbtu');
    expect(result.conversionFactor).toBe(947.817);
  });

  it('passes through unknown unit as lowercase with factor 1', () => {
    const result = mapPMToLocalUnit('SomeUnknownUnit');
    expect(result.unit).toBe('someunknownunit');
    expect(result.conversionFactor).toBe(1);
  });
});
