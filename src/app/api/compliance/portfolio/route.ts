import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getComplianceSummary } from '@/lib/emissions/compliance-service';

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
    const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));

    const summary = await getComplianceSummary(dbUser.organizationId, year);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
