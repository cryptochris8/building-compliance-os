'use server';

import { db } from '@/lib/db';
import { buildings, users, utilityReadings } from '@/lib/db/schema';
import { eq, count, inArray } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/helpers';
import { actionLimiter } from '@/lib/rate-limit';

interface OnboardingStatus {
  completed: boolean;
  currentStep: number;
  hasBuilding: boolean;
  hasReadings: boolean;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const authUser = await getAuthUser();
  if (!authUser) {
    return { completed: false, currentStep: 1, hasBuilding: false, hasReadings: false };
  }

  // Check if user has already dismissed onboarding
  const [dbUser] = await db
    .select({ organizationId: users.organizationId, onboardingCompletedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  if (dbUser?.onboardingCompletedAt) {
    return { completed: true, currentStep: 4, hasBuilding: true, hasReadings: true };
  }

  const orgId = dbUser?.organizationId;
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

export async function markOnboardingComplete(): Promise<{ success: boolean }> {
  const authUser = await getAuthUser();
  if (!authUser) return { success: false };

  const { success: rlOk } = await actionLimiter.check(5, 'action:onboarding:' + authUser.id);
  if (!rlOk) return { success: false };

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(users.id, authUser.id));

  return { success: true };
}
