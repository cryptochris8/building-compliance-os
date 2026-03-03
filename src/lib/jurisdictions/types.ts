export interface CarbonCoefficients {
  electricity_kwh: number;
  natural_gas_kbtu: number;
  district_steam_kbtu: number;
  fuel_oil_2_kbtu: number;
  fuel_oil_4_kbtu: number;
}

export interface EmissionsLimits {
  [occupancyType: string]: number; // tCO2e per sqft
}

export interface CompliancePeriod {
  startYear: number;
  endYear: number;
  coefficients: CarbonCoefficients;
  limits: EmissionsLimits;
  penaltyPerTon: number;
}

export interface JurisdictionConfig {
  id: string;
  name: string;
  city: string;
  state: string;
  thresholdSqft: number;
  reportingDeadline: { month: number; day: number };
  periods: CompliancePeriod[];
  latePenalty?: string;
  notes?: string;
}
