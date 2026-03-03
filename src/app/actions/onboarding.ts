'use server';

import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users, buildings } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

interface OnboardingStatus {
  completed: boolean;
  currentStep: number;
  hasBuilding: boolean;
  hasReadings: boolean;
}

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [dbUser] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return dbUser?.organizationId ?? null;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const orgId = await getOrgId();
  if (!orgId) {
    return { completed: false, currentStep: 1, hasBuilding: false, hasReadings: false };
  }

  const [buildingCount] = await db
    .select({ value: count() })
    .from(buildings)
    .where(eq(buildings.organizationId, orgId));

  const hasBuilding = (buildingCount?.value ?? 0) > 0;

  // For simplicity, we derive the step from what data exists
  let currentStep = 1;
  if (hasBuilding) currentStep = 3;
  // Readings check would need a join - keep it simple for onboarding
  const hasReadings = false;

  return {
    completed: hasBuilding,
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
