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

// ComplianceResultWithBreakdown is defined in compliance-service.ts (extends ComplianceResult)
// Re-export here so consumers can import from either location
export type { ComplianceResultWithBreakdown } from './compliance-service';
