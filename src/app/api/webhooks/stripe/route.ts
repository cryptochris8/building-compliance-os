import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe, tierFromPriceId } from '@/lib/stripe/client';
import { db } from '@/lib/db';
import { organizations, subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { webhookLimiter } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  // Verify signature FIRST before rate limiting to prevent DoS via forged requests
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  // Rate limit AFTER signature verification (only authenticated Stripe requests count)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { success } = await webhookLimiter.check(100, ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        if (!orgId) break;

        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.toString() ?? '';
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.toString() ?? '';

        // Guard against null/empty subscriptionId (one-time payments or Stripe nulls)
        if (!subscriptionId) break;

        // Idempotency check: skip if this subscription was already processed
        const [existingSub] = await db.select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
          .limit(1);
        if (existingSub) break;

        // Fetch the subscription to get price info
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price?.id ?? '';
        const tier = tierFromPriceId(priceId);

        // Insert subscription + update org tier atomically
        await db.transaction(async (tx) => {
          await tx.insert(subscriptions).values({
            orgId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            priceId,
            status: sub.status === 'trialing' ? 'trialing' : 'active',
            trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            currentPeriodEnd: sub.items.data[0] ? new Date(sub.items.data[0].current_period_end * 1000) : null,
          });

          await tx.update(organizations)
            .set({
              subscriptionTier: tier === 'free' ? 'free' : tier,
              stripeCustomerId: customerId,
            })
            .where(eq(organizations.id, orgId));
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        const priceId = sub.items.data[0]?.price?.id ?? '';
        const tier = tierFromPriceId(priceId);

        const statusMap: Record<string, 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid'> = {
          trialing: 'trialing',
          active: 'active',
          past_due: 'past_due',
          canceled: 'canceled',
          incomplete: 'incomplete',
          incomplete_expired: 'incomplete_expired',
          unpaid: 'unpaid',
        };
        const mappedStatus = statusMap[sub.status] ?? 'active';

        await db.transaction(async (tx) => {
          await tx.update(subscriptions)
            .set({
              priceId,
              status: mappedStatus,
              trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
              currentPeriodEnd: sub.items.data[0] ? new Date(sub.items.data[0].current_period_end * 1000) : null,
            })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));

          await tx.update(organizations)
            .set({ subscriptionTier: tier === 'free' ? 'free' : tier })
            .where(eq(organizations.id, orgId));
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        await db.transaction(async (tx) => {
          await tx.update(subscriptions)
            .set({ status: 'canceled' })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));

          await tx.update(organizations)
            .set({ subscriptionTier: 'free' })
            .where(eq(organizations.id, orgId));
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // In Stripe v20+, subscription info is in invoice.parent
        const subDetails = invoice.parent?.subscription_details;
        const subscriptionId = subDetails?.subscription?.toString();

        if (subscriptionId) {
          // Find the org associated with this subscription and downgrade
          const [sub] = await db.select({ orgId: subscriptions.orgId })
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
            .limit(1);

          await db.update(subscriptions)
            .set({ status: 'past_due' })
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

          if (sub?.orgId) {
            await db.update(organizations)
              .set({ subscriptionTier: 'free' })
              .where(eq(organizations.id, sub.orgId));
          }
        }
        break;
      }

      default:
        // Unhandled event type - no action needed
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
