import type { JurisdictionConfig } from './types';
import { nycLL97 } from './nyc-ll97';
import { bostonBERDO } from './boston-berdo';

export type { JurisdictionConfig, CarbonCoefficients, EmissionsLimits, CompliancePeriod } from './types';
export { nycLL97 } from './nyc-ll97';
export { bostonBERDO } from './boston-berdo';

/**
 * Registry of all supported jurisdictions.
 * Add new jurisdictions here as they are implemented.
 */
export const jurisdictionRegistry: Record<string, JurisdictionConfig> = {
  'nyc-ll97': nycLL97,
  'boston-berdo': bostonBERDO,
};

/**
 * Get a jurisdiction config by ID.
 * Throws if the jurisdiction is not found.
 */
export function getJurisdiction(id: string): JurisdictionConfig {
  const config = jurisdictionRegistry[id];
  if (!config) {
    throw new Error(`Unknown jurisdiction: ${id}`);
  }
  return config;
}

/**
 * Get list of all available jurisdictions for display.
 */
export function listJurisdictions(): Array<{ id: string; name: string }> {
  return Object.values(jurisdictionRegistry).map((j) => ({
    id: j.id,
    name: j.name,
  }));
}
