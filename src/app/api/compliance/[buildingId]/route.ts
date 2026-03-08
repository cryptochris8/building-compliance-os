import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { complianceYears } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { calculateBuildingCompliance } from '@/lib/emissions/compliance-service';
import { assertBuildingAccess, type UserRole } from '@/lib/auth/helpers';

const WRITE_ROLES: UserRole[] = ['owner', 'admin'];

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
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
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
    const message = error instanceof Error ? error.message : 'Recalculation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
