import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  PLAN_CONFIGS,
} from '@/lib/stripe/client';
import { apiLimiter } from '@/lib/rate-limit';
import { getAuthContextWithBilling } from '@/lib/auth/helpers';
import { apiSuccess, ApiErrors } from '@/lib/api/response';

// The client sends a tier name; the price ID is resolved server-side from
// PLAN_CONFIGS. This keeps Stripe price IDs out of client code entirely —
// the server's STRIPE_*_PRICE_ID env vars are the single source of truth.
const checkoutSchema = z.object({
  tier: z.enum(['pro', 'portfolio']),
});

// POST: Create checkout session
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContextWithBilling();
    if (!auth) return ApiErrors.unauthorized();

    const { success } = await apiLimiter.check(5, 'billing:' + auth.orgId);
    if (!success) return ApiErrors.tooManyRequests();

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return ApiErrors.badRequest(parsed.error.issues[0]?.message || 'Invalid request body');
    }
    const { tier } = parsed.data;

    const priceId = PLAN_CONFIGS[tier].stripePriceIdMonthly;
    const url = await createCheckoutSession(auth.orgId, priceId, auth.email);
    return apiSuccess({ url });
  } catch (err) {
    console.error('Billing checkout failed:', err);
    return ApiErrors.internal('Failed to create checkout session');
  }
}

// GET: Manage billing portal or get subscription status
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContextWithBilling();
    if (!auth) return ApiErrors.unauthorized();

    const action = request.nextUrl.searchParams.get('action');

    if (action === 'portal') {
      if (!auth.stripeCustomerId) {
        return ApiErrors.badRequest('No active billing account');
      }
      const url = await createPortalSession(auth.stripeCustomerId);
      return apiSuccess({ url });
    }

    // Default: get subscription status
    if (!auth.stripeCustomerId) {
      return apiSuccess({
        tier: 'free',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    const sub = await getSubscription(auth.stripeCustomerId);
    if (!sub) {
      return apiSuccess({
        tier: 'free',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    return apiSuccess(sub);
  } catch (err) {
    console.error('Billing GET failed:', err);
    return ApiErrors.internal('Failed to retrieve billing information');
  }
}
