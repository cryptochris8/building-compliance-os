// Shared types for compliance data - safe for client and server use

export interface PortfolioSummary {
  totalBuildings: number;
  compliantCount: number;
  atRiskCount: number;
  overLimitCount: number;
  incompleteCount: number;
  totalPenaltyExposure: number;
  totalEmissions: number;
  buildings: PortfolioBuildingRow[];
}

export interface PortfolioBuildingRow {
  id: string;
  name: string;
  address: string;
  grossSqft: number;
  status: string;
  totalEmissions: number;
  emissionsLimit: number;
  overUnder: number;
  penalty: number;
  completeness: number;
}

export interface ComplianceResultWithBreakdown {
  totalEmissionsTco2e: number;
  emissionsLimitTco2e: number;
  emissionsOverLimit: number;
  estimatedPenaltyDollars: number;
  status: 'incomplete' | 'compliant' | 'at_risk' | 'over_limit';
  dataCompletenessPct: number;
  missingMonths: string[];
  breakdownByFuel: Record<string, number>;
  breakdownByMonth: Record<string, number>;
  buildingId: string;
  year: number;
}
