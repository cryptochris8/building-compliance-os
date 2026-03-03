import { db } from '@/lib/db';
import { utilityReadings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { calculateBuildingCompliance } from './compliance-service';

export async function triggerRecalculation(buildingId: string): Promise<void> {
  const readings = await db
    .select({ periodStart: utilityReadings.periodStart })
    .from(utilityReadings)
    .where(eq(utilityReadings.buildingId, buildingId));

  const years = new Set<number>();
  for (const r of readings) {
    const year = new Date(r.periodStart).getFullYear();
    years.add(year);
  }

  for (const year of years) {
    try {
      await calculateBuildingCompliance(buildingId, year);
    } catch (error) {
      console.error('Recalculation failed for building ' + buildingId + ' year ' + year + ':', error);
    }
  }
}
