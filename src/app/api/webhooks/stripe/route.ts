import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { getStripe, tierFromPriceId } from '@/lib/stripe/client';
import { db } from '@/lib/db';
import { organizations, subscriptions, processedStripeEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { webhookLimiter } from '@/lib/rate-limit';

const checkoutSessionSchema = z.object({
  metadata: z.object({ orgId: z.string().uuid() }).passthrough(),
  subscription: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
  customer: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
});

const subscriptionEventSchema = z.object({
  id: z.string(),
  metadata: z.object({ orgId: z.string().uuid() }).passthrough(),
  status: z.string(),
  trial_end: z.number().nullable().optional(),
  items: z.object({
    data: z.array(z.object({
      price: z.object({ id: z.string() }).nullable().optional(),
      current_period_end: z.number(),
    })).min(1),
  }),
});

const invoicePaymentFailedSchema = z.object({
  parent: z.object({
    subscription_details: z.object({
      subscription: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
});

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  // Rate limit AFTER signature verification (only authenticated Stripe requests count)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { success } = await webhookLimiter.check(100, ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Idempotency claim lives INSIDE each handler's transaction so that
  // if side-effect writes throw, the claim rolls back with them and
  // Stripe's retry can re-apply the changes. Claiming outside the tx
  // would let a handler crash leave a "processed" marker for an event
  // whose side effects never happened.
  try {
    let duplicate = false;
    switch (event.type) {
      case 'checkout.session.completed': {
        const parsed = checkoutSessionSchema.safeParse(event.data.object);
        if (!parsed.success) {
          console.error('Stripe checkout.session.completed payload failed validation:', parsed.error.flatten());
          break;
        }
        const session = parsed.data;
        const orgId = session.metadata.orgId;

        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? '';
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id ?? '';

        if (!subscriptionId) break;

        // Fetch the subscription to get price info
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price?.id ?? '';
        const tier = tierFromPriceId(priceId);

        duplicate = await db.transaction(async (tx) => {
          const claimed = await tx.insert(processedStripeEvents)
            .values({ eventId: event.id, eventType: event.type })
            .onConflictDoNothing({ target: processedStripeEvents.eventId })
            .returning({ eventId: processedStripeEvents.eventId });
          if (claimed.length === 0) return true;

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

          return false;
        });
        break;
      }

      case 'customer.subscription.updated': {
        const parsed = subscriptionEventSchema.safeParse(event.data.object);
        if (!parsed.success) {
          console.error('Stripe customer.subscription.updated payload failed validation:', parsed.error.flatten());
          break;
        }
        const sub = parsed.data;
        const orgId = sub.metadata.orgId;

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

        duplicate = await db.transaction(async (tx) => {
          const claimed = await tx.insert(processedStripeEvents)
            .values({ eventId: event.id, eventType: event.type })
            .onConflictDoNothing({ target: processedStripeEvents.eventId })
            .returning({ eventId: processedStripeEvents.eventId });
          if (claimed.length === 0) return true;

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

          return false;
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const parsed = subscriptionEventSchema.safeParse(event.data.object);
        if (!parsed.success) {
          console.error('Stripe customer.subscription.deleted payload failed validation:', parsed.error.flatten());
          break;
        }
        const sub = parsed.data;
        const orgId = sub.metadata.orgId;

        duplicate = await db.transaction(async (tx) => {
          const claimed = await tx.insert(processedStripeEvents)
            .values({ eventId: event.id, eventType: event.type })
            .onConflictDoNothing({ target: processedStripeEvents.eventId })
            .returning({ eventId: processedStripeEvents.eventId });
          if (claimed.length === 0) return true;

          await tx.update(subscriptions)
            .set({ status: 'canceled' })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));

          await tx.update(organizations)
            .set({ subscriptionTier: 'free' })
            .where(eq(organizations.id, orgId));

          return false;
        });
        break;
      }

      case 'invoice.payment_failed': {
        const parsed = invoicePaymentFailedSchema.safeParse(event.data.object);
        if (!parsed.success) {
          console.error('Stripe invoice.payment_failed payload failed validation:', parsed.error.flatten());
          break;
        }
        const subRef = parsed.data.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id;

        if (!subscriptionId) break;

        duplicate = await db.transaction(async (tx) => {
          const claimed = await tx.insert(processedStripeEvents)
            .values({ eventId: event.id, eventType: event.type })
            .onConflictDoNothing({ target: processedStripeEvents.eventId })
            .returning({ eventId: processedStripeEvents.eventId });
          if (claimed.length === 0) return true;

          const [sub] = await tx.select({ orgId: subscriptions.orgId })
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
            .limit(1);

          await tx.update(subscriptions)
            .set({ status: 'past_due' })
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

          if (sub?.orgId) {
            await tx.update(organizations)
              .set({ subscriptionTier: 'free' })
              .where(eq(organizations.id, sub.orgId));
          }
          return false;
        });
        break;
      }

      default:
        // Unhandled event type — no claim, no side effects.
        break;
    }

    if (duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
