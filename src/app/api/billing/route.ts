import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users, organizations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
} from '@/lib/stripe/client';
import { apiLimiter } from '@/lib/rate-limit';

const checkoutSchema = z.object({
  priceId: z.string().min(1, 'priceId is required'),
});

async function getAuthOrgId(): Promise<{
  orgId: string;
  email: string;
  stripeCustomerId: string | null;
} | null> {
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
    .select({ stripeCustomerId: organizations.stripeCustomerId })
    .from(organizations)
    .where(eq(organizations.id, dbUser.organizationId))
    .limit(1);

  return {
    orgId: dbUser.organizationId,
    email: user.email ?? '',
    stripeCustomerId: org?.stripeCustomerId ?? null,
  };
}

// POST: Create checkout session
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthOrgId();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 5 checkout attempts per minute per org
    const { success } = apiLimiter.check(5, 'billing:' + auth.orgId);
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: Manage billing portal or get subscription status
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthOrgId();
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
