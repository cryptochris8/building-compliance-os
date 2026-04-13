'use server';

import { db } from '@/lib/db';
import { buildings, utilityReadings } from '@/lib/db/schema';
import { eq, count, inArray } from 'drizzle-orm';
import { getUserOrgId } from '@/lib/auth/helpers';

interface OnboardingStatus {
  completed: boolean;
  currentStep: number;
  hasBuilding: boolean;
  hasReadings: boolean;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const orgId = await getUserOrgId();
  if (!orgId) {
    return { completed: false, currentStep: 1, hasBuilding: false, hasReadings: false };
  }

  const orgBuildings = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(eq(buildings.organizationId, orgId));

  const hasBuilding = orgBuildings.length > 0;

  // Check if any buildings have readings
  let hasReadings = false;
  if (hasBuilding) {
    const buildingIds = orgBuildings.map(b => b.id);
    const [readingCount] = await db
      .select({ value: count() })
      .from(utilityReadings)
      .where(inArray(utilityReadings.buildingId, buildingIds));
    hasReadings = (readingCount?.value ?? 0) > 0;
  }

  let currentStep = 1;
  if (hasBuilding) currentStep = 3;
  if (hasReadings) currentStep = 4;

  return {
    completed: hasBuilding && hasReadings,
    currentStep,
    hasBuilding,
    hasReadings,
  };
}

export async function completeStep(step: number): Promise<{ success: boolean }> {
  // Steps are tracked implicitly by data presence
  // This action can be used for analytics or state tracking
  void step;
  return { success: true };
}

export async function markOnboardingComplete(): Promise<{ success: boolean }> {
  // Mark onboarding as complete - could set a flag on the user/org
  return { success: true };
}
