import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getComplianceSummary } from '@/lib/emissions/compliance-service';

const yearParamSchema = z.coerce.number().int().min(2000).max(2100);

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [dbUser] = await db.select({ organizationId: users.organizationId })
      .from(users).where(eq(users.id, user.id)).limit(1);
    if (!dbUser?.organizationId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const yearResult = yearParamSchema.safeParse(url.searchParams.get('year') || new Date().getFullYear());
    if (!yearResult.success) {
      return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });
    }
    const year = yearResult.data;

    const summary = await getComplianceSummary(dbUser.organizationId, year);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Portfolio summary failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
