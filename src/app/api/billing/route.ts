import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
} from '@/lib/stripe/client';
import { apiLimiter } from '@/lib/rate-limit';
import { getAuthContextWithBilling } from '@/lib/auth/helpers';

const checkoutSchema = z.object({
  priceId: z.string().min(1, 'priceId is required'),
});

// POST: Create checkout session
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContextWithBilling();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 5 checkout attempts per minute per org
    const { success } = await apiLimiter.check(5, 'billing:' + auth.orgId);
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      );
    }
    const { priceId } = parsed.data;

    const url = await createCheckoutSession(auth.orgId, priceId, auth.email);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('Billing checkout failed:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}

// GET: Manage billing portal or get subscription status
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContextWithBilling();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const action = request.nextUrl.searchParams.get('action');

    if (action === 'portal') {
      if (!auth.stripeCustomerId) {
        return NextResponse.json(
          { error: 'No active billing account' },
          { status: 400 },
        );
      }
      const url = await createPortalSession(auth.stripeCustomerId);
      return NextResponse.json({ url });
    }

    // Default: get subscription status
    if (!auth.stripeCustomerId) {
      return NextResponse.json({
        tier: 'free',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    const sub = await getSubscription(auth.stripeCustomerId);
    if (!sub) {
      return NextResponse.json({
        tier: 'free',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    return NextResponse.json(sub);
  } catch (err) {
    console.error('Billing GET failed:', err);
    return NextResponse.json({ error: 'Failed to retrieve billing information' }, { status: 500 });
  }
}
