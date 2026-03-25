'use server';

import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  createCheckoutSession as stripeCheckout,
  createPortalSession as stripePortal,
  PLAN_CONFIGS,
  type PlanTier,
} from '@/lib/stripe/client';
import { getAuthContextWithBilling } from '@/lib/auth/helpers';

export async function createCheckoutSessionAction(priceId: string) {
  const auth = await getAuthContextWithBilling();
  if (!auth) return { error: 'Unauthorized' };

  try {
    const url = await stripeCheckout(auth.orgId, priceId, auth.email);
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create checkout session' };
  }
}

export async function createPortalSessionAction() {
  const auth = await getAuthContextWithBilling();
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
  const auth = await getAuthContextWithBilling();
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

  const plan = PLAN_CONFIGS[auth.tier as PlanTier] ?? PLAN_CONFIGS.free;

  return {
    tier: auth.tier,
    planName: plan.name,
    status,
    trialEnd: trialEnd?.toISOString() ?? null,
    buildingLimit: plan.buildingLimit,
  };
}
