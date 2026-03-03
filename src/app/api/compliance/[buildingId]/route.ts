import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { complianceYears } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { calculateBuildingCompliance } from '@/lib/emissions/compliance-service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { buildingId } = await params;
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');

    if (yearParam) {
      const year = parseInt(yearParam);
      const [cy] = await db.select().from(complianceYears)
        .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
        .limit(1);
      if (!cy) {
        return NextResponse.json({ error: 'No compliance data for this year' }, { status: 404 });
      }
      return NextResponse.json(cy);
    }

    // Return latest year
    const [cy] = await db.select().from(complianceYears)
      .where(eq(complianceYears.buildingId, buildingId))
      .orderBy(desc(complianceYears.year))
      .limit(1);
    if (!cy) {
      return NextResponse.json({ error: 'No compliance data found' }, { status: 404 });
    }
    return NextResponse.json(cy);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { buildingId } = await params;
    const year = new Date().getFullYear();
    const result = await calculateBuildingCompliance(buildingId, year);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recalculation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
