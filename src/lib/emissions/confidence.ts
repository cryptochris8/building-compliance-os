import { db } from '@/lib/db';
import { utilityReadings } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ConfidenceAssessment {
  level: 'high' | 'medium' | 'low';
  reasons: string[];
}

export async function assessConfidence(
  buildingId: string,
  year: number
): Promise<ConfidenceAssessment> {
  const reasons: string[] = [];
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const readings = await db
    .select({
      confidence: utilityReadings.confidence,
      periodStart: utilityReadings.periodStart,
      periodEnd: utilityReadings.periodEnd,
    })
    .from(utilityReadings)
    .where(
      and(
        eq(utilityReadings.buildingId, buildingId),
        sql`${utilityReadings.periodStart} >= ${yearStart}`,
        sql`${utilityReadings.periodEnd} <= ${yearEnd}`
      )
    );

  const coveredMonths = new Set<number>();
  for (const r of readings) {
    const start = new Date(r.periodStart);
    const end = new Date(r.periodEnd);
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      if (current.getFullYear() === year) {
        coveredMonths.add(current.getMonth() + 1);
      }
      current.setMonth(current.getMonth() + 1);
    }
  }

  const completeness = (coveredMonths.size / 12) * 100;
  const estimatedCount = readings.filter((r) => r.confidence === 'estimated').length;
  const flaggedCount = readings.filter((r) => r.confidence === 'flagged').length;

  let level: 'high' | 'medium' | 'low' = 'high';

  if (completeness < 75) {
    level = 'low';
    reasons.push('Data completeness is ' + Math.round(completeness) + '% (less than 75% threshold)');
  } else if (completeness <= 95) {
    level = 'medium';
    reasons.push('Data completeness is ' + Math.round(completeness) + '% (between 75% and 95%)');
  }

  if (flaggedCount > 0) {
    level = 'low';
    reasons.push(flaggedCount + ' reading' + (flaggedCount > 1 ? 's are' : ' is') + ' flagged for review');
  }

  if (estimatedCount > 0 && level !== 'low') {
    level = 'medium';
    reasons.push(estimatedCount + ' reading' + (estimatedCount > 1 ? 's are' : ' is') + ' estimated (not confirmed)');
  }

  if (readings.length === 0) {
    level = 'low';
    reasons.push('No utility readings found for this year');
  }

  if (reasons.length === 0) {
    reasons.push('All data is confirmed with full year coverage');
  }

  return { level, reasons };
}

export function assessConfidenceFromData(
  readings: Array<{ confidence: string | null; periodStart: string; periodEnd: string }>,
  year: number
): ConfidenceAssessment {
  const reasons: string[] = [];
  const coveredMonths = new Set<number>();
  for (const r of readings) {
    const start = new Date(r.periodStart);
    const end = new Date(r.periodEnd);
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      if (current.getFullYear() === year) {
        coveredMonths.add(current.getMonth() + 1);
      }
      current.setMonth(current.getMonth() + 1);
    }
  }

  const completeness = (coveredMonths.size / 12) * 100;
  const estimatedCount = readings.filter((r) => r.confidence === 'estimated').length;
  const flaggedCount = readings.filter((r) => r.confidence === 'flagged').length;

  let level: 'high' | 'medium' | 'low' = 'high';

  if (completeness < 75) {
    level = 'low';
    reasons.push('Data completeness is ' + Math.round(completeness) + '% (less than 75% threshold)');
  } else if (completeness <= 95) {
    level = 'medium';
    reasons.push('Data completeness is ' + Math.round(completeness) + '% (between 75% and 95%)');
  }

  if (flaggedCount > 0) {
    level = 'low';
    reasons.push(flaggedCount + ' reading' + (flaggedCount > 1 ? 's are' : ' is') + ' flagged for review');
  }

  if (estimatedCount > 0 && level !== 'low') {
    level = 'medium';
    reasons.push(estimatedCount + ' reading' + (estimatedCount > 1 ? 's are' : ' is') + ' estimated (not confirmed)');
  }

  if (readings.length === 0) {
    level = 'low';
    reasons.push('No utility readings found for this year');
  }

  if (reasons.length === 0) {
    reasons.push('All data is confirmed with full year coverage');
  }

  return { level, reasons };
}
