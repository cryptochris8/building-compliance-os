import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const constructEvent = vi.fn();
const retrieveSubscription = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: retrieveSubscription },
  }),
  tierFromPriceId: (priceId: string) => {
    if (priceId === 'price_pro') return 'pro';
    if (priceId === 'price_portfolio') return 'portfolio';
    return 'free';
  },
}));

interface TxCapture {
  inserts: Array<{ table: unknown; values: Record<string, unknown> }>;
  updates: Array<{ table: unknown; set: Record<string, unknown>; where: unknown }>;
}

const txCapture: TxCapture = { inserts: [], updates: [] };
// idempotencyClaim returns the rows from the ON CONFLICT DO NOTHING ... RETURNING.
// Empty array = event was already processed (duplicate). Non-empty = first time.
const idempotencyClaim = vi.fn();
// selectInsideTx is used by invoice.payment_failed to look up orgId before update.
let selectInsideTxResult: Array<Record<string, unknown>> = [];

// Tag schema tables so the tx stub can route by name.
vi.mock('@/lib/db/schema', () => ({
  organizations: { _name: 'organizations' },
  subscriptions: { _name: 'subscriptions' },
  processedStripeEvents: {
    _name: 'processed_stripe_events',
    eventId: { _name: 'event_id' },
  },
}));

const fakeTx = {
  insert: (table: { _name?: string }) => {
    if (table._name === 'processed_stripe_events') {
      return {
        values: (v: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({
            returning: () => {
              return idempotencyClaim(v);
            },
          }),
        }),
      };
    }
    return {
      values: (values: Record<string, unknown>) => {
        txCapture.inserts.push({ table, values });
        return Promise.resolve();
      },
    };
  },
  update: (table: unknown) => ({
    set: (set: Record<string, unknown>) => ({
      where: (where: unknown) => {
        txCapture.updates.push({ table, set, where });
        return Promise.resolve();
      },
    }),
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => selectInsideTxResult,
      }),
    }),
  }),
};

const transaction = vi.fn(async (fn: (tx: typeof fakeTx) => Promise<boolean>) => fn(fakeTx));

vi.mock('@/lib/db', () => ({
  db: {
    transaction: (fn: (tx: typeof fakeTx) => Promise<boolean>) => transaction(fn),
  },
}));

const webhookCheck = vi.fn().mockResolvedValue({ success: true, remaining: 29 });
vi.mock('@/lib/rate-limit', () => ({
  webhookLimiter: { check: (limit: number, token: string) => webhookCheck(limit, token) },
}));

// Import AFTER mocks are registered
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
const { POST } = await import('../route');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test', ...headers },
    body,
  });
}

function subItem(priceId: string, periodEnd: number) {
  return {
    price: { id: priceId },
    current_period_end: periodEnd,
  } as unknown as Stripe.SubscriptionItem;
}

beforeEach(() => {
  constructEvent.mockReset();
  retrieveSubscription.mockReset();
  transaction.mockClear();
  webhookCheck.mockReset().mockResolvedValue({ success: true, remaining: 29 });
  txCapture.inserts = [];
  txCapture.updates = [];
  selectInsideTxResult = [];
  // Default: idempotency claim succeeds (event has not been seen).
  idempotencyClaim.mockReset().mockResolvedValue([{ eventId: 'evt_1' }]);
});

// ---------------------------------------------------------------------------
// Signature verification & rate limiting
// ---------------------------------------------------------------------------

describe('Stripe webhook — signature & rate limiting', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when STRIPE_WEBHOOK_SECRET is not set', async () => {
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(400);
    process.env.STRIPE_WEBHOOK_SECRET = saved;
  });

  it('returns 400 when signature verification throws', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching');
    });
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('signature');
    expect(webhookCheck).not.toHaveBeenCalled();
  });

  it('verifies signature before checking rate limit', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    await POST(makeRequest('{}') as never);
    expect(webhookCheck).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit exceeded', async () => {
    constructEvent.mockReturnValue({ id: 'evt_1', type: 'unknown.event', data: { object: {} } } as unknown as Stripe.Event);
    webhookCheck.mockResolvedValue({ success: false, remaining: 0 });
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(429);
  });

  it('returns 200 for unhandled event types without claiming idempotency', async () => {
    constructEvent.mockReturnValue({ id: 'evt_1', type: 'ping.pong', data: { object: {} } } as unknown as Stripe.Event);
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    expect(idempotencyClaim).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

describe('Stripe webhook — checkout.session.completed', () => {
  function checkoutEvent(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
    return {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { orgId: '11111111-1111-4111-8111-111111111111' },
          subscription: 'sub_abc',
          customer: 'cus_xyz',
          ...overrides,
        } as Stripe.Checkout.Session,
      },
    } as Stripe.Event;
  }

  it('no-ops when orgId is missing from metadata (Zod validation fails)', async () => {
    constructEvent.mockReturnValue(checkoutEvent({ metadata: {} }));
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('no-ops when subscription id is empty (one-time payments)', async () => {
    constructEvent.mockReturnValue(checkoutEvent({ subscription: null }));
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns { received, duplicate: true } when event was already processed', async () => {
    constructEvent.mockReturnValue(checkoutEvent());
    retrieveSubscription.mockResolvedValue({
      status: 'active',
      trial_end: null,
      items: { data: [subItem('price_pro', 1_800_000_000)] },
    } as unknown as Stripe.Subscription);
    idempotencyClaim.mockResolvedValue([]); // empty = duplicate

    const res = await POST(makeRequest('{}') as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body).toEqual({ received: true, duplicate: true });
    expect(txCapture.inserts).toHaveLength(0);
    expect(txCapture.updates).toHaveLength(0);
  });

  it('inserts subscription and updates org tier for pro checkout', async () => {
    constructEvent.mockReturnValue(checkoutEvent());
    retrieveSubscription.mockResolvedValue({
      status: 'active',
      trial_end: null,
      items: { data: [subItem('price_pro', 1_800_000_000)] },
    } as unknown as Stripe.Subscription);

    const res = await POST(makeRequest('{}') as never);

    expect(res.status).toBe(200);
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_abc');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(idempotencyClaim).toHaveBeenCalledWith({ eventId: 'evt_checkout_1', eventType: 'checkout.session.completed' });
    expect(txCapture.inserts).toHaveLength(1);
    expect(txCapture.inserts[0].values).toMatchObject({
      orgId: '11111111-1111-4111-8111-111111111111',
      stripeCustomerId: 'cus_xyz',
      stripeSubscriptionId: 'sub_abc',
      priceId: 'price_pro',
      status: 'active',
    });
    expect(txCapture.updates).toHaveLength(1);
    expect(txCapture.updates[0].set).toMatchObject({
      subscriptionTier: 'pro',
      stripeCustomerId: 'cus_xyz',
    });
  });

  it('maps trialing status and trial_end correctly', async () => {
    constructEvent.mockReturnValue(checkoutEvent());
    retrieveSubscription.mockResolvedValue({
      status: 'trialing',
      trial_end: 1_700_000_000,
      items: { data: [subItem('price_pro', 1_800_000_000)] },
    } as unknown as Stripe.Subscription);

    await POST(makeRequest('{}') as never);

    expect(txCapture.inserts[0].values.status).toBe('trialing');
    expect(txCapture.inserts[0].values.trialEnd).toEqual(new Date(1_700_000_000 * 1000));
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.updated
// ---------------------------------------------------------------------------

describe('Stripe webhook — customer.subscription.updated', () => {
  function updatedEvent(status: Stripe.Subscription.Status, priceId = 'price_pro'): Stripe.Event {
    return {
      id: 'evt_updated_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_abc',
          metadata: { orgId: '11111111-1111-4111-8111-111111111111' },
          status,
          trial_end: null,
          items: { data: [subItem(priceId, 1_800_000_000)] },
        } as unknown as Stripe.Subscription,
      },
    } as Stripe.Event;
  }

  it('no-ops when orgId is missing (Zod validation fails)', async () => {
    const evt = updatedEvent('active');
    (evt.data.object as Stripe.Subscription).metadata = {};
    constructEvent.mockReturnValue(evt);
    await POST(makeRequest('{}') as never);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('updates subscription status and org tier atomically', async () => {
    constructEvent.mockReturnValue(updatedEvent('active', 'price_portfolio'));
    const res = await POST(makeRequest('{}') as never);

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(idempotencyClaim).toHaveBeenCalledWith({ eventId: 'evt_updated_1', eventType: 'customer.subscription.updated' });
    expect(txCapture.updates).toHaveLength(2);
    expect(txCapture.updates[0].set).toMatchObject({ priceId: 'price_portfolio', status: 'active' });
    expect(txCapture.updates[1].set).toMatchObject({ subscriptionTier: 'portfolio' });
  });

  it('maps past_due status from Stripe to internal enum', async () => {
    constructEvent.mockReturnValue(updatedEvent('past_due'));
    await POST(makeRequest('{}') as never);
    expect(txCapture.updates[0].set.status).toBe('past_due');
  });

  it('downgrades org to free when priceId does not match a paid tier', async () => {
    constructEvent.mockReturnValue(updatedEvent('active', 'price_unknown'));
    await POST(makeRequest('{}') as never);
    expect(txCapture.updates[1].set.subscriptionTier).toBe('free');
  });

  it('returns duplicate flag when event was already processed', async () => {
    constructEvent.mockReturnValue(updatedEvent('active'));
    idempotencyClaim.mockResolvedValue([]);

    const res = await POST(makeRequest('{}') as never);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body).toEqual({ received: true, duplicate: true });
    expect(txCapture.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------

describe('Stripe webhook — customer.subscription.deleted', () => {
  function deletedEvent(metadata: Record<string, string> = { orgId: '11111111-1111-4111-8111-111111111111' }): Stripe.Event {
    return {
      id: 'evt_deleted_1',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_abc',
          metadata,
          status: 'canceled',
          trial_end: null,
          items: { data: [subItem('price_pro', 1_800_000_000)] },
        } as unknown as Stripe.Subscription,
      },
    } as Stripe.Event;
  }

  it('cancels subscription and resets org tier to free', async () => {
    constructEvent.mockReturnValue(deletedEvent());

    const res = await POST(makeRequest('{}') as never);

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txCapture.updates).toHaveLength(2);
    expect(txCapture.updates[0].set).toMatchObject({ status: 'canceled' });
    expect(txCapture.updates[1].set).toMatchObject({ subscriptionTier: 'free' });
  });

  it('no-ops when orgId is missing (Zod validation fails)', async () => {
    constructEvent.mockReturnValue(deletedEvent({}));
    await POST(makeRequest('{}') as never);
    expect(transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// invoice.payment_failed
// ---------------------------------------------------------------------------

describe('Stripe webhook — invoice.payment_failed', () => {
  function invoiceEvent(subscriptionId: string | null): Stripe.Event {
    return {
      id: 'evt_invoice_1',
      type: 'invoice.payment_failed',
      data: {
        object: {
          parent: subscriptionId
            ? { subscription_details: { subscription: subscriptionId } }
            : null,
        } as unknown as Stripe.Invoice,
      },
    } as Stripe.Event;
  }

  it('marks subscription past_due and downgrades org to free', async () => {
    constructEvent.mockReturnValue(invoiceEvent('sub_abc'));
    selectInsideTxResult = [{ orgId: '11111111-1111-4111-8111-111111111111' }];

    const res = await POST(makeRequest('{}') as never);

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txCapture.updates).toHaveLength(2);
    expect(txCapture.updates[0].set).toMatchObject({ status: 'past_due' });
    expect(txCapture.updates[1].set).toMatchObject({ subscriptionTier: 'free' });
  });

  it('updates subscription status even when no matching org is found', async () => {
    constructEvent.mockReturnValue(invoiceEvent('sub_orphan'));
    selectInsideTxResult = [];

    const res = await POST(makeRequest('{}') as never);

    expect(res.status).toBe(200);
    expect(txCapture.updates).toHaveLength(1);
    expect(txCapture.updates[0].set).toMatchObject({ status: 'past_due' });
  });

  it('no-ops when invoice has no subscription id', async () => {
    constructEvent.mockReturnValue(invoiceEvent(null));
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns duplicate flag when event was already processed', async () => {
    constructEvent.mockReturnValue(invoiceEvent('sub_abc'));
    idempotencyClaim.mockResolvedValue([]);

    const res = await POST(makeRequest('{}') as never);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body).toEqual({ received: true, duplicate: true });
    expect(txCapture.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('Stripe webhook — error handling', () => {
  it('returns 500 when the handler throws after signature verification', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_err_1',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_abc',
          metadata: { orgId: '11111111-1111-4111-8111-111111111111' },
          status: 'canceled',
          trial_end: null,
          items: { data: [subItem('price_pro', 1_800_000_000)] },
        } as unknown as Stripe.Subscription,
      },
    } as Stripe.Event);
    transaction.mockRejectedValueOnce(new Error('db connection lost'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeRequest('{}') as never);
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
