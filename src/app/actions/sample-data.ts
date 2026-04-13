'use server';

import { db } from '@/lib/db';
import { buildings, utilityAccounts, utilityReadings } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth/helpers';
import { calculateBuildingCompliance } from '@/lib/emissions/compliance-service';

/**
 * Seed a realistic sample building with 12 months of utility data
 * so new users can explore the dashboard immediately.
 */
export async function seedSampleData(): Promise<{ error?: string; buildingId?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Unauthorized' };

  // Check if org already has buildings — don't double-seed
  const [existing] = await db.select({ value: count() })
    .from(buildings).where(eq(buildings.organizationId, ctx.orgId));
  if ((existing?.value ?? 0) > 0) {
    return { error: 'You already have buildings. Delete them first to load sample data.' };
  }

  const year = new Date().getFullYear();

  // Create sample building — realistic NYC office
  const [building] = await db.insert(buildings).values({
    organizationId: ctx.orgId,
    name: 'Sample: 350 Fifth Avenue',
    addressLine1: '350 Fifth Avenue',
    city: 'New York',
    state: 'NY',
    zip: '10118',
    borough: 'Manhattan',
    grossSqft: '55000',
    yearBuilt: 1931,
    occupancyType: 'B - Business',
    jurisdictionId: 'nyc-ll97',
    notes: 'Sample building — delete when ready to add your real properties.',
  }).returning();

  // Create utility accounts
  const [elecAccount] = await db.insert(utilityAccounts).values({
    buildingId: building.id,
    utilityType: 'electricity',
    accountNumber: 'SAMPLE-ELEC-001',
    providerName: 'Con Edison',
  }).returning();

  const [gasAccount] = await db.insert(utilityAccounts).values({
    buildingId: building.id,
    utilityType: 'natural_gas',
    accountNumber: 'SAMPLE-GAS-001',
    providerName: 'National Grid',
  }).returning();

  // Monthly electricity consumption (kWh) — realistic office pattern
  // Higher in summer (cooling), lower in spring/fall
  const monthlyElec = [
    52000, 48000, 45000, 42000, 55000, 68000,
    75000, 72000, 60000, 47000, 44000, 50000,
  ];

  // Monthly natural gas (therms) — higher in winter (heating)
  const monthlyGas = [
    3200, 2800, 2100, 1200, 600, 300,
    200, 200, 400, 1100, 2200, 3000,
  ];

  // Insert 12 months of electricity readings
  const readingValues = [];
  for (let m = 0; m < 12; m++) {
    const month = m + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    readingValues.push({
      utilityAccountId: elecAccount.id,
      buildingId: building.id,
      periodStart,
      periodEnd,
      consumptionValue: String(monthlyElec[m]),
      consumptionUnit: 'kwh',
      costDollars: String(Math.round(monthlyElec[m] * 0.22)),
      source: 'manual' as const,
      confidence: 'confirmed' as const,
    });

    readingValues.push({
      utilityAccountId: gasAccount.id,
      buildingId: building.id,
      periodStart,
      periodEnd,
      consumptionValue: String(monthlyGas[m]),
      consumptionUnit: 'therms',
      costDollars: String(Math.round(monthlyGas[m] * 1.05)),
      source: 'manual' as const,
      confidence: 'confirmed' as const,
    });
  }

  await db.insert(utilityReadings).values(readingValues);

  // Trigger compliance calculation
  try {
    await calculateBuildingCompliance(building.id, year);
  } catch (err) {
    console.error('Sample data: compliance calculation failed:', err instanceof Error ? err.message : err);
  }

  revalidatePath('/dashboard');
  revalidatePath('/buildings');
  revalidatePath('/compliance');

  return { buildingId: building.id };
}
