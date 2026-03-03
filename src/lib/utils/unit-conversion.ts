// ============================================================
// Unit Conversion Library
// Pure functions for converting between energy units
// ============================================================

/**
 * Convert therms to kBtu.
 * 1 therm = 100 kBtu
 */
export function thermsToKbtu(therms: number): number {
  return therms * 100;
}

/**
 * Convert kWh to kBtu.
 * 1 kWh = 3.412 kBtu
 */
export function kwhToKbtu(kwh: number): number {
  return kwh * 3.412;
}

/**
 * Convert gallons of fuel oil to kBtu.
 * Fuel oil #2: 138.5 kBtu/gallon
 * Fuel oil #4: 145.1 kBtu/gallon
 */
export function gallonsOilToKbtu(
  gallons: number,
  fuelType: 'fuel_oil_2' | 'fuel_oil_4'
): number {
  const conversionFactors: Record<'fuel_oil_2' | 'fuel_oil_4', number> = {
    fuel_oil_2: 138.5,
    fuel_oil_4: 145.1,
  };
  return gallons * conversionFactors[fuelType];
}

/**
 * Convert kBtu to therms.
 * 1 therm = 100 kBtu
 */
export function kbtuToTherms(kbtu: number): number {
  return kbtu / 100;
}

/**
 * Convert kBtu to kWh.
 * 1 kWh = 3.412 kBtu
 */
export function kbtuToKwh(kbtu: number): number {
  return kbtu / 3.412;
}

/**
 * Normalize any supported energy unit to kBtu.
 * Supported units: kwh, therms, kbtu, gallons (requires context of fuel type)
 *
 * For gallons, the utilityType parameter is used to determine the fuel type.
 */
export function normalizeToKbtu(
  value: number,
  unit: string,
  utilityType?: string
): number {
  const normalizedUnit = unit.toLowerCase().trim();

  switch (normalizedUnit) {
    case 'kwh':
      return kwhToKbtu(value);
    case 'therms':
      return thermsToKbtu(value);
    case 'kbtu':
      return value;
    case 'gallons': {
      if (utilityType === 'fuel_oil_2') {
        return gallonsOilToKbtu(value, 'fuel_oil_2');
      }
      if (utilityType === 'fuel_oil_4') {
        return gallonsOilToKbtu(value, 'fuel_oil_4');
      }
      // Default to fuel oil #2 if no type specified
      return gallonsOilToKbtu(value, 'fuel_oil_2');
    }
    default:
      // If unit is already kBtu or unrecognized, return as-is
      return value;
  }
}

/**
 * Get the expected default unit for a given utility type.
 */
export function getDefaultUnitForUtilityType(
  utilityType: string
): string {
  const defaults: Record<string, string> = {
    electricity: 'kwh',
    natural_gas: 'therms',
    district_steam: 'kbtu',
    fuel_oil_2: 'gallons',
    fuel_oil_4: 'gallons',
  };
  return defaults[utilityType] ?? 'kbtu';
}

/**
 * Format a consumption value with its unit for display.
 */
export function formatConsumption(value: number, unit: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);

  const unitLabels: Record<string, string> = {
    kwh: 'kWh',
    therms: 'therms',
    kbtu: 'kBtu',
    gallons: 'gallons',
  };

  return `${formatted} ${unitLabels[unit.toLowerCase()] ?? unit}`;
}
