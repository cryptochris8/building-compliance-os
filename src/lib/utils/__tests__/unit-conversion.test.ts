import { describe, it, expect } from 'vitest';
import {
  thermsToKbtu,
  kwhToKbtu,
  gallonsOilToKbtu,
  kbtuToTherms,
  kbtuToKwh,
  normalizeToKbtu,
  getDefaultUnitForUtilityType,
  formatConsumption,
} from '../unit-conversion';

describe('thermsToKbtu', () => {
  it('converts therms to kBtu (1 therm = 100 kBtu)', () => {
    expect(thermsToKbtu(1)).toBe(100);
    expect(thermsToKbtu(10)).toBe(1000);
    expect(thermsToKbtu(0)).toBe(0);
  });
});

describe('kwhToKbtu', () => {
  it('converts kWh to kBtu (1 kWh = 3.412 kBtu)', () => {
    expect(kwhToKbtu(1)).toBeCloseTo(3.412);
    expect(kwhToKbtu(1000)).toBeCloseTo(3412);
    expect(kwhToKbtu(0)).toBe(0);
  });
});

describe('gallonsOilToKbtu', () => {
  it('converts fuel oil #2 gallons (138.5 kBtu/gal)', () => {
    expect(gallonsOilToKbtu(1, 'fuel_oil_2')).toBeCloseTo(138.5);
    expect(gallonsOilToKbtu(10, 'fuel_oil_2')).toBeCloseTo(1385);
  });

  it('converts fuel oil #4 gallons (145.1 kBtu/gal)', () => {
    expect(gallonsOilToKbtu(1, 'fuel_oil_4')).toBeCloseTo(145.1);
    expect(gallonsOilToKbtu(10, 'fuel_oil_4')).toBeCloseTo(1451);
  });
});

describe('kbtuToTherms', () => {
  it('converts kBtu to therms', () => {
    expect(kbtuToTherms(100)).toBe(1);
    expect(kbtuToTherms(1000)).toBe(10);
  });
});

describe('kbtuToKwh', () => {
  it('converts kBtu to kWh', () => {
    expect(kbtuToKwh(3.412)).toBeCloseTo(1);
    expect(kbtuToKwh(3412)).toBeCloseTo(1000);
  });
});

describe('normalizeToKbtu', () => {
  it('converts kwh to kBtu', () => {
    expect(normalizeToKbtu(1000, 'kwh')).toBeCloseTo(3412);
  });

  it('converts therms to kBtu', () => {
    expect(normalizeToKbtu(10, 'therms')).toBe(1000);
  });

  it('returns kbtu as-is', () => {
    expect(normalizeToKbtu(500, 'kbtu')).toBe(500);
  });

  it('converts gallons using fuel_oil_2 by default', () => {
    expect(normalizeToKbtu(1, 'gallons')).toBeCloseTo(138.5);
  });

  it('converts gallons using fuel_oil_4 when specified', () => {
    expect(normalizeToKbtu(1, 'gallons', 'fuel_oil_4')).toBeCloseTo(145.1);
  });

  it('returns value as-is for unrecognized units', () => {
    expect(normalizeToKbtu(42, 'unknown_unit')).toBe(42);
  });
});

describe('getDefaultUnitForUtilityType', () => {
  it('returns kwh for electricity', () => {
    expect(getDefaultUnitForUtilityType('electricity')).toBe('kwh');
  });

  it('returns therms for natural_gas', () => {
    expect(getDefaultUnitForUtilityType('natural_gas')).toBe('therms');
  });

  it('returns gallons for fuel oils', () => {
    expect(getDefaultUnitForUtilityType('fuel_oil_2')).toBe('gallons');
    expect(getDefaultUnitForUtilityType('fuel_oil_4')).toBe('gallons');
  });

  it('returns kbtu for district_steam', () => {
    expect(getDefaultUnitForUtilityType('district_steam')).toBe('kbtu');
  });

  it('returns kbtu for unknown types', () => {
    expect(getDefaultUnitForUtilityType('unknown')).toBe('kbtu');
  });
});

describe('formatConsumption', () => {
  it('formats with correct unit label', () => {
    expect(formatConsumption(1000, 'kwh')).toBe('1,000 kWh');
    expect(formatConsumption(50, 'therms')).toBe('50 therms');
    expect(formatConsumption(100, 'kbtu')).toBe('100 kBtu');
    expect(formatConsumption(25, 'gallons')).toBe('25 gallons');
  });

  it('formats large numbers with commas', () => {
    expect(formatConsumption(1234567, 'kwh')).toBe('1,234,567 kWh');
  });

  it('passes through unknown units', () => {
    expect(formatConsumption(42, 'MWh')).toBe('42 MWh');
  });

  it('handles decimal values', () => {
    expect(formatConsumption(1234.56, 'kwh')).toBe('1,234.56 kWh');
  });
});
