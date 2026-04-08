import 'server-only';
import { db } from '@/lib/db';
import { organizations, buildings, subscriptions } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import type { PlanTier } from '@/lib/stripe/client';
import { PLAN_CONFIGS } from '@/lib/stripe/client';

// ---------------------------------------------------------------------------
// Feature definitions
// ---------------------------------------------------------------------------
export type GatedFeature =
  | 'csvUpload'
  | 'reportGeneration'
  | 'pmSync'
  | 'bulkOperations';

const FEATURE_TIERS: Record<GatedFeature, PlanTier[]> = {
  csvUpload: ['pro', 'portfolio'],
  reportGeneration: ['pro', 'portfolio'],
  pmSync: ['pro', 'portfolio'],
  bulkOperations: ['portfolio'],
};

// ---------------------------------------------------------------------------
// Resolve org tier
// ---------------------------------------------------------------------------
export async function getOrgTier(orgId: string): Promise<PlanTier> {
  const [org] = await db
    .select({ tier: organizations.subscriptionTier })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const tier = org?.tier as string | undefined;
  // Only return tiers that exist in PLAN_CONFIGS; fall back to 'free' for unknown tiers (e.g. 'enterprise')
  if (tier && tier in PLAN_CONFIGS) return tier as PlanTier;
  return 'free';
}

// ---------------------------------------------------------------------------
// Check feature access
// ---------------------------------------------------------------------------
export async function checkAccess(
  orgId: string,
  feature: GatedFeature,
): Promise<boolean> {
  const tier = await getOrgTier(orgId);
  return FEATURE_TIERS[feature].includes(tier);
}

// ---------------------------------------------------------------------------
// Check building limit
// ---------------------------------------------------------------------------
export async function checkBuildingLimit(
  orgId: string,
): Promise<{ allowed: boolean; current: number; limit: number; tier: PlanTier }> {
  const tier = await getOrgTier(orgId);
  const limit = PLAN_CONFIGS[tier].buildingLimit;

  const [result] = await db
    .select({ value: count() })
    .from(buildings)
    .where(eq(buildings.organizationId, orgId));

  const current = result?.value ?? 0;
  return { allowed: current < limit, current, limit, tier };
}

// ---------------------------------------------------------------------------
// Get usage summary
// ---------------------------------------------------------------------------
export interface UsageSummary {
  tier: PlanTier;
  buildingCount: number;
  buildingLimit: number;
  features: Record<GatedFeature, boolean>;
}

export async function getUsage(orgId: string): Promise<UsageSummary> {
  const tier = await getOrgTier(orgId);
  const config = PLAN_CONFIGS[tier];

  const [result] = await db
    .select({ value: count() })
    .from(buildings)
    .where(eq(buildings.organizationId, orgId));

  const buildingCount = result?.value ?? 0;

  const features: Record<GatedFeature, boolean> = {
    csvUpload: FEATURE_TIERS.csvUpload.includes(tier),
    reportGeneration: FEATURE_TIERS.reportGeneration.includes(tier),
    pmSync: FEATURE_TIERS.pmSync.includes(tier),
    bulkOperations: FEATURE_TIERS.bulkOperations.includes(tier),
  };

  return {
    tier,
    buildingCount,
    buildingLimit: config.buildingLimit,
    features,
  };
}

// ---------------------------------------------------------------------------
// Trial status
// ---------------------------------------------------------------------------
export async function isTrialActive(orgId: string): Promise<{
  active: boolean;
  daysRemaining: number;
  trialEnd: Date | null;
}> {
  const [sub] = await db
    .select({ trialEnd: subscriptions.trialEnd, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .limit(1);

  if (!sub?.trialEnd) return { active: false, daysRemaining: 0, trialEnd: null };

  const now = new Date();
  const trialEnd = new Date(sub.trialEnd);
  const diff = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));

  return {
    active: sub.status === 'trialing' && diff > 0,
    daysRemaining,
    trialEnd,
  };
}
