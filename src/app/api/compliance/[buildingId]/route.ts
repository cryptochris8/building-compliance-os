import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { complianceYears } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { calculateBuildingCompliance } from '@/lib/emissions/compliance-service';
import { assertBuildingAccess, WRITE_ROLES } from '@/lib/auth/helpers';

const yearParamSchema = z.coerce.number().int().min(2000).max(2100);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const { buildingId } = await params;

    // Verify building ownership
    const access = await assertBuildingAccess(buildingId);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');

    if (yearParam) {
      const yearResult = yearParamSchema.safeParse(yearParam);
      if (!yearResult.success) {
        return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });
      }
      const year = yearResult.data;
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
    console.error('Compliance GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const { buildingId } = await params;

    // Verify building ownership and write permission
    const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const year = new Date().getFullYear();
    const result = await calculateBuildingCompliance(buildingId, year);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Compliance recalculation failed:', error);
    // Allow specific business logic errors (locked year, building not found) to pass through
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('locked') || msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: 'Recalculation failed' }, { status: 500 });
  }
}
