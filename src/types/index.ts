// ============================================================
// Application Types
// Mirrors the Drizzle schema for use in components
// ============================================================

export type SubscriptionTier = 'free' | 'pro' | 'portfolio' | 'enterprise';
export type UserRole = 'owner' | 'admin' | 'member';
export type UtilityType = 'electricity' | 'natural_gas' | 'district_steam' | 'fuel_oil_2' | 'fuel_oil_4';
export type DataSource = 'manual' | 'csv_upload' | 'portfolio_manager' | 'green_button';
export type ConfidenceLevel = 'confirmed' | 'estimated' | 'flagged';
export type ComplianceStatus = 'incomplete' | 'compliant' | 'at_risk' | 'over_limit';
export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type DocumentType = 'utility_bill' | 'compliance_report' | 'deduction_form' | 'other';

export interface Organization {
  id: string;
  name: string;
  stripeCustomerId: string | null;
  subscriptionTier: SubscriptionTier;
  createdAt: string;
}

export interface User {
  id: string;
  organizationId: string | null;
  role: UserRole;
  fullName: string | null;
  email: string;
  createdAt: string;
}

export interface Building {
  id: string;
  organizationId: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  borough: string | null;
  bbl: string | null;
  bin: string | null;
  grossSqft: string;
  yearBuilt: number | null;
  occupancyType: string;
  jurisdictionId: string;
  portfolioManagerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityAccount {
  id: string;
  buildingId: string;
  accountNumber: string | null;
  utilityType: UtilityType;
  providerName: string | null;
  isTenantPaid: boolean;
  tenantName: string | null;
  tenantUnit: string | null;
  createdAt: string;
}

export interface UtilityReading {
  id: string;
  utilityAccountId: string;
  buildingId: string;
  periodStart: string;
  periodEnd: string;
  consumptionValue: string;
  consumptionUnit: string;
  costDollars: string | null;
  source: DataSource;
  sourceFileId: string | null;
  confidence: ConfidenceLevel;
  createdAt: string;
}

export interface ComplianceYear {
  id: string;
  buildingId: string;
  year: number;
  jurisdictionId: string;
  totalEmissionsTco2e: string | null;
  emissionsLimitTco2e: string | null;
  emissionsOverLimit: string | null;
  estimatedPenaltyDollars: string | null;
  status: ComplianceStatus;
  dataCompletenessPct: string | null;
  missingMonths: string[] | null;
  reportDueDate: string | null;
  reportSubmitted: boolean;
  reportSubmittedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  buildingId: string;
  complianceYearId: string | null;
  fileName: string;
  fileType: string;
  filePath: string;
  fileSizeBytes: number | null;
  documentType: DocumentType | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface ImportJob {
  id: string;
  organizationId: string;
  buildingId: string | null;
  fileName: string;
  filePath: string;
  status: ImportJobStatus;
  rowsTotal: number | null;
  rowsImported: number | null;
  rowsFailed: number | null;
  errorLog: unknown;
  createdAt: string;
  completedAt: string | null;
}

// ============================================================
// Occupancy Types for NYC LL97
// ============================================================

export const NYC_OCCUPANCY_TYPES = [
  'A - Assembly',
  'B - Business',
  'E - Educational',
  'F - Factory',
  'H - High Hazard',
  'I-1 - Institutional',
  'I-2 - Institutional (Hospital)',
  'I-3 - Institutional (Detention)',
  'I-4 - Institutional (Day Care)',
  'M - Mercantile',
  'R-1 - Residential (Hotel)',
  'R-2 - Residential (Multi-family)',
  'S - Storage',
  'U - Utility',
] as const;

export type NYCOccupancyType = (typeof NYC_OCCUPANCY_TYPES)[number];

// ============================================================
// NYC Boroughs
// ============================================================

export const NYC_BOROUGHS = [
  'Manhattan',
  'Brooklyn',
  'Queens',
  'Bronx',
  'Staten Island',
] as const;

export type NYCBorough = (typeof NYC_BOROUGHS)[number];
