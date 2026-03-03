import type { JurisdictionConfig } from './types';

/**
 * NYC Local Law 97 Configuration
 * Building Emissions Limits for covered buildings (>25,000 sqft)
 *
 * Coefficients sourced from NYC LL97 implementation rules.
 * Limits are in tCO2e per square foot per year.
 * Penalty is $268 per metric ton over the limit.
 */
export const nycLL97: JurisdictionConfig = {
  id: 'nyc-ll97',
  name: 'NYC Local Law 97',
  city: 'New York',
  state: 'NY',
  thresholdSqft: 25000,
  reportingDeadline: { month: 5, day: 1 },
  periods: [
    {
      startYear: 2024,
      endYear: 2029,
      coefficients: {
        electricity_kwh: 0.000288962,
        natural_gas_kbtu: 0.00005311,
        district_steam_kbtu: 0.00004493,
        fuel_oil_2_kbtu: 0.00007421,
        fuel_oil_4_kbtu: 0.00007529,
      },
      limits: {
        'A - Assembly': 0.01074,
        'B - Business': 0.00846,
        'E - Educational': 0.00758,
        'F - Factory': 0.00574,
        'H - High Hazard': 0.00574,
        'I-1 - Institutional': 0.01138,
        'I-2 - Institutional (Hospital)': 0.02381,
        'I-3 - Institutional (Detention)': 0.02381,
        'I-4 - Institutional (Day Care)': 0.01138,
        'M - Mercantile': 0.01181,
        'R-1 - Residential (Hotel)': 0.00987,
        'R-2 - Residential (Multi-family)': 0.00675,
        'S - Storage': 0.00426,
        'U - Utility': 0.00426,
      },
      penaltyPerTon: 268,
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
        'A - Assembly': 0.00420,
        'B - Business': 0.00453,
        'E - Educational': 0.00344,
        'F - Factory': 0.00167,
        'H - High Hazard': 0.00167,
        'I-1 - Institutional': 0.00598,
        'I-2 - Institutional (Hospital)': 0.01230,
        'I-3 - Institutional (Detention)': 0.01230,
        'I-4 - Institutional (Day Care)': 0.00598,
        'M - Mercantile': 0.00403,
        'R-1 - Residential (Hotel)': 0.00526,
        'R-2 - Residential (Multi-family)': 0.00407,
        'S - Storage': 0.00110,
        'U - Utility': 0.00110,
      },
      penaltyPerTon: 268,
    },
  ],
  latePenalty: 'Additional penalty for late filing as determined by DOB',
  notes: 'Covered buildings are those with gross floor area >25,000 sqft or two or more buildings on the same tax lot with combined gross floor area >50,000 sqft.',
};
