import { getJurisdiction } from '@/lib/jurisdictions';

export interface OccupancyMixEntry {
  type: string;
  sqft: number;
}

/**
 * Calculate the weighted emissions limit for a mixed-use building.
 * Formula: Sum of (sqft_per_type * limit_per_type) for each occupancy type
 */
export function calculateMixedUseLimit(
  occupancyMix: OccupancyMixEntry[],
  jurisdictionId: string,
  year: number
): number {
  const jurisdiction = getJurisdiction(jurisdictionId);
  const period = jurisdiction.periods.find(
    (p) => year >= p.startYear && year <= p.endYear
  );
  if (!period) {
    throw new Error(
      'No compliance period found for jurisdiction ' + jurisdictionId + ' and year ' + year
    );
  }

  let totalLimit = 0;
  for (const entry of occupancyMix) {
    const limitPerSqft = period.limits[entry.type];
    if (limitPerSqft === undefined) {
      throw new Error(
        'No emissions limit found for occupancy type "' + entry.type + '" in jurisdiction ' + jurisdictionId
      );
    }
    totalLimit += entry.sqft * limitPerSqft;
  }

  return Math.round(totalLimit * 1000) / 1000;
}

/**
 * Validate that occupancy mix sqft totals match building gross sqft
 */
export function validateOccupancyMix(
  occupancyMix: OccupancyMixEntry[],
  grossSqft: number,
  tolerance: number = 1
): { valid: boolean; totalMixSqft: number; difference: number } {
  const totalMixSqft = occupancyMix.reduce((sum, e) => sum + e.sqft, 0);
  const difference = Math.abs(totalMixSqft - grossSqft);
  return {
    valid: difference <= tolerance,
    totalMixSqft,
    difference,
  };
}
