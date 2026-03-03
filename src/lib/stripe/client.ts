import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Stripe singleton
// ---------------------------------------------------------------------------
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' as Stripe.LatestApiVersion });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Pricing Tiers
// ---------------------------------------------------------------------------
export type PlanTier = 'free' | 'pro' | 'portfolio';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  buildingLimit: number;
  features: string[];
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
}

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: {
    tier: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    buildingLimit: 1,
    features: [
      '1 building',
      'Manual data entry',
      'Basic compliance status',
    ],
    stripePriceIdMonthly: '',
    stripePriceIdAnnual: '',
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    monthlyPrice: 149,
    annualMonthlyPrice: 99,
    buildingLimit: 10,
    features: [
      'Up to 10 buildings',
      'CSV upload',
      'Report generation',
      'Portfolio Manager sync',
      'Email support',
    ],
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? 'price_pro_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? 'price_pro_annual',
  },
  portfolio: {
    tier: 'portfolio',
    name: 'Portfolio',
    monthlyPrice: 499,
    annualMonthlyPrice: 399,
    buildingLimit: 50,
    features: [
      'Up to 50 buildings',
      'Everything in Pro',
      'Bulk operations',
      'Priority support',
      'Custom reports',
    ],
    stripePriceIdMonthly: process.env.STRIPE_PORTFOLIO_MONTHLY_PRICE_ID ?? 'price_portfolio_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PORTFOLIO_ANNUAL_PRICE_ID ?? 'price_portfolio_annual',
  },
};

// ---------------------------------------------------------------------------
// Map a Stripe price ID back to our tier
// ---------------------------------------------------------------------------
export function tierFromPriceId(priceId: string): PlanTier {
  for (const [tier, cfg] of Object.entries(PLAN_CONFIGS)) {
    if (cfg.stripePriceIdMonthly === priceId || cfg.stripePriceIdAnnual === priceId) {
      return tier as PlanTier;
    }
  }
  return 'free';
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------
export async function createCheckoutSession(
  orgId: string,
  priceId: string,
  customerEmail?: string,
): Promise<string> {
  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/settings?billing=success`,
    cancel_url: `${baseUrl}/settings?billing=cancelled`,
    subscription_data: {
      trial_period_days: 14,
      metadata: { orgId },
    },
    metadata: { orgId },
    ...(customerEmail ? { customer_email: customerEmail } : {}),
  });

  return session.url ?? '';
}

// ---------------------------------------------------------------------------
// Billing portal
// ---------------------------------------------------------------------------
export async function createPortalSession(
  stripeCustomerId: string,
): Promise<string> {
  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${baseUrl}/settings`,
  });

  return session.url;
}

// ---------------------------------------------------------------------------
// Get subscription
// ---------------------------------------------------------------------------
export interface SubscriptionInfo {
  tier: PlanTier;
  status: string;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export async function getSubscription(
  stripeCustomerId: string,
): Promise<SubscriptionInfo | null> {
  const stripe = getStripe();

  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    limit: 1,
    status: 'all',
  });

  const sub = subs.data[0];
  if (!sub) return null;

  const priceId = sub.items.data[0]?.price?.id ?? '';
  return {
    tier: tierFromPriceId(priceId),
    status: sub.status,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    currentPeriodEnd: sub.items.data[0] ? new Date(sub.items.data[0].current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}
