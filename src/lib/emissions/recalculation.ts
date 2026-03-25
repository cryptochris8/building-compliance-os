import { db } from '@/lib/db';
import { utilityReadings } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { calculateBuildingCompliance } from './compliance-service';

export async function triggerRecalculation(buildingId: string): Promise<void> {
  // Use DISTINCT to get only unique years instead of fetching all readings
  const yearRows = await db
    .selectDistinct({
      year: sql<number>`EXTRACT(YEAR FROM ${utilityReadings.periodStart})::int`,
    })
    .from(utilityReadings)
    .where(eq(utilityReadings.buildingId, buildingId));

  const years = yearRows.map((r) => r.year);

  // Recalculate all years in parallel
  const results = await Promise.allSettled(
    years.map((year) => calculateBuildingCompliance(buildingId, year))
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      const reason = (results[i] as PromiseRejectedResult).reason;
      console.error(
        'Recalculation failed for building ' + buildingId + ' year ' + years[i] + ':',
        reason instanceof Error ? reason.message : reason
      );
    }
  }
}
