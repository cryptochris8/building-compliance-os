import 'server-only';
import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const TRIAL_WATERMARK = 'TRIAL — NOT VALID FOR LL97 FILING';

/**
 * If the org is on a trial subscription, returns the watermark text that
 * generated report PDFs must overlay on every page. Returns null for paid
 * subscriptions whose reports are safe to file.
 *
 * Free users are blocked upstream by the reportGeneration feature gate, so a
 * caller that reaches this helper with no subscription row is misconfigured —
 * fail safe by watermarking rather than producing a clean PDF.
 */
export async function getReportWatermark(orgId: string): Promise<string | null> {
  const [sub] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .limit(1);

  if (!sub) return TRIAL_WATERMARK;
  if (sub.status === 'trialing') return TRIAL_WATERMARK;
  return null;
}
