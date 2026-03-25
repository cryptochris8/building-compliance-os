import type { JurisdictionConfig } from './types';

/**
 * Boston Building Emissions Reduction and Disclosure Ordinance (BERDO 2.0)
 *
 * Applies to non-residential buildings ≥20,000 sqft and residential ≥15 units.
 * Emissions standards are set per building type in 5-year compliance periods.
 * Coefficients sourced from BERDO 2.0 implementation rules (2025 update).
 * Penalty is $234 per metric ton over the limit (adjusted annually).
 *
 * Note: BERDO uses the same carbon coefficients as the EPA Portfolio Manager
 * for consistency with Boston's reporting requirements.
 */
export const bostonBERDO: JurisdictionConfig = {
  id: 'boston-berdo',
  name: 'Boston BERDO 2.0',
  city: 'Boston',
  state: 'MA',
  thresholdSqft: 20000,
  reportingDeadline: { month: 9, day: 15 }, // September 15
  periods: [
    {
      startYear: 2025,
      endYear: 2029,
      coefficients: {
        electricity_kwh: 0.000279545,
        natural_gas_kbtu: 0.00005311,
        district_steam_kbtu: 0.00004493,
        fuel_oil_2_kbtu: 0.00007421,
        fuel_oil_4_kbtu: 0.00007529,
      },
      limits: {
        'Assembly': 0.01100,
        'Education': 0.00800,
        'Food Sales & Service': 0.01400,
        'Healthcare (Inpatient)': 0.02200,
        'Healthcare (Outpatient)': 0.01000,
        'Lodging': 0.00950,
        'Multifamily Housing': 0.00650,
        'Office': 0.00820,
        'Retail': 0.00750,
        'Services': 0.00700,
        'Storage': 0.00350,
        'Technology / Science': 0.01200,
        'Other': 0.00800,
      },
      penaltyPerTon: 234,
    },
    {
      startYear: 2030,
      endYear: 2034,
      coefficients: {
        electricity_kwh: 0.000195718,
        natural_gas_kbtu: 0.00005311,
        district_steam_kbtu: 0.00002253,
        fuel_oil_2_kbtu: 0.00007421,
        fuel_oil_4_kbtu: 0.00007529,
      },
      limits: {
        'Assembly': 0.00550,
        'Education': 0.00400,
        'Food Sales & Service': 0.00700,
        'Healthcare (Inpatient)': 0.01100,
        'Healthcare (Outpatient)': 0.00500,
        'Lodging': 0.00475,
        'Multifamily Housing': 0.00380,
        'Office': 0.00410,
        'Retail': 0.00375,
        'Services': 0.00350,
        'Storage': 0.00175,
        'Technology / Science': 0.00600,
        'Other': 0.00400,
      },
      penaltyPerTon: 234,
    },
  ],
  latePenalty: 'Buildings that fail to comply may be subject to additional fines up to $1,000 per day.',
  notes: 'BERDO 2.0 applies to non-residential buildings ≥20,000 sqft, residential buildings ≥15 units, and any building ≥35 units regardless of size. Alternative compliance pathways include Individual Compliance Schedules (ICS).',
};
