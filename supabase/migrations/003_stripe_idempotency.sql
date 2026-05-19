-- ============================================================
-- Stripe webhook idempotency
-- Adds a processed_stripe_events table and tightens the
-- subscriptions.stripe_subscription_id index to UNIQUE so
-- duplicate webhook deliveries cannot create duplicate rows.
-- ============================================================

-- 1. Idempotency table -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Service role only — webhook handler runs with the service key.
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass for processed_stripe_events"
  ON public.processed_stripe_events FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Tighten subscriptions.stripe_subscription_id ---------------------
-- The previous schema had a non-unique index. Switch to UNIQUE so the
-- DB itself prevents two rows for the same Stripe subscription, even
-- in the unlikely case a duplicate slips past the application-level
-- idempotency guard.
DROP INDEX IF EXISTS public.idx_subscriptions_stripe_sub_id;

-- If there are pre-existing duplicate rows from before this migration,
-- this CREATE will fail. Run the dedup query below first if needed:
--
--   DELETE FROM public.subscriptions s1
--   USING public.subscriptions s2
--   WHERE s1.id < s2.id
--     AND s1.stripe_subscription_id = s2.stripe_subscription_id;
--
CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscriptions_stripe_sub_id
  ON public.subscriptions (stripe_subscription_id);
