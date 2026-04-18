import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getComplianceSummary } from '@/lib/emissions/compliance-service';
import { apiSuccess, ApiErrors } from '@/lib/api/response';

const yearParamSchema = z.coerce.number().int().min(2000).max(2100);

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ApiErrors.unauthorized();

    const [dbUser] = await db.select({ organizationId: users.organizationId })
      .from(users).where(eq(users.id, user.id)).limit(1);
    if (!dbUser?.organizationId) return ApiErrors.notFound('Organization');

    const url = new URL(request.url);
    const yearResult = yearParamSchema.safeParse(url.searchParams.get('year') || new Date().getFullYear());
    if (!yearResult.success) return ApiErrors.badRequest('Invalid year parameter');
    const year = yearResult.data;

    const summary = await getComplianceSummary(dbUser.organizationId, year);
    return apiSuccess(summary);
  } catch (error) {
    console.error('Portfolio summary failed:', error);
    return ApiErrors.internal();
  }
}
