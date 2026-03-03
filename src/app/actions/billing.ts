'use server';

import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users, organizations, subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  createCheckoutSession as stripeCheckout,
  createPortalSession as stripePortal,
  PLAN_CONFIGS,
  type PlanTier,
} from '@/lib/stripe/client';

async function getAuthOrgInfo() {
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
  if (!dbUser?.organizationId) return null;

  const [org] = await db
    .select({
      stripeCustomerId: organizations.stripeCustomerId,
      subscriptionTier: organizations.subscriptionTier,
    })
    .from(organizations)
    .where(eq(organizations.id, dbUser.organizationId))
    .limit(1);

  return {
    orgId: dbUser.organizationId,
    email: user.email ?? '',
    stripeCustomerId: org?.stripeCustomerId ?? null,
    tier: (org?.subscriptionTier as PlanTier) ?? 'free',
  };
}

export async function createCheckoutSessionAction(priceId: string) {
  const auth = await getAuthOrgInfo();
  if (!auth) return { error: 'Unauthorized' };

  try {
    const url = await stripeCheckout(auth.orgId, priceId, auth.email);
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create checkout session' };
  }
}

export async function createPortalSessionAction() {
  const auth = await getAuthOrgInfo();
  if (!auth) return { error: 'Unauthorized' };
  if (!auth.stripeCustomerId) return { error: 'No active billing account' };

  try {
    const url = await stripePortal(auth.stripeCustomerId);
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create portal session' };
  }
}

export async function getSubscriptionStatus() {
  const auth = await getAuthOrgInfo();
  if (!auth) return null;

  let trialEnd: Date | null = null;
  let status = 'active';

  if (auth.stripeCustomerId) {
    const [sub] = await db
      .select({ trialEnd: subscriptions.trialEnd, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, auth.orgId))
      .limit(1);
    if (sub) {
      trialEnd = sub.trialEnd ? new Date(sub.trialEnd) : null;
      status = sub.status ?? 'active';
    }
  }

  const plan = PLAN_CONFIGS[auth.tier] ?? PLAN_CONFIGS.free;

  return {
    tier: auth.tier,
    planName: plan.name,
    status,
    trialEnd: trialEnd?.toISOString() ?? null,
    buildingLimit: plan.buildingLimit,
  };
}
