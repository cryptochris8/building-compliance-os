import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';

// Production deployments must have INNGEST_SIGNING_KEY set so the serve
// handler can verify webhook signatures. Skipped during `next build`
// (NEXT_PHASE === 'phase-production-build') so build doesn't require the
// secret at compile time — only at runtime when we need it to verify events.
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  !process.env.INNGEST_SIGNING_KEY
) {
  throw new Error('INNGEST_SIGNING_KEY must be set in production to verify Inngest webhooks');
}

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
