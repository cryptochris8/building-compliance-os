import { z } from 'zod';
import { db } from '@/lib/db';
import { complianceYears } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { calculateBuildingCompliance } from '@/lib/emissions/compliance-service';
import { getAuthUser, assertBuildingAccess, WRITE_ROLES } from '@/lib/auth/helpers';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api/response';

const yearParamSchema = z.coerce.number().int().min(2000).max(2100);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const { buildingId } = await params;

    const authUser = await getAuthUser();
    if (!authUser) return ApiErrors.unauthorized();

    const access = await assertBuildingAccess(buildingId);
    if (!access) return ApiErrors.forbidden();

    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');

    if (yearParam) {
      const yearResult = yearParamSchema.safeParse(yearParam);
      if (!yearResult.success) return ApiErrors.badRequest('Invalid year parameter');
      const year = yearResult.data;
      const [cy] = await db.select().from(complianceYears)
        .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
        .limit(1);
      if (!cy) return ApiErrors.notFound('Compliance data for this year');
      return apiSuccess(cy);
    }

    const [cy] = await db.select().from(complianceYears)
      .where(eq(complianceYears.buildingId, buildingId))
      .orderBy(desc(complianceYears.year))
      .limit(1);
    if (!cy) return ApiErrors.notFound('Compliance data');
    return apiSuccess(cy);
  } catch (error) {
    console.error('Compliance GET failed:', error);
    return ApiErrors.internal();
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const { buildingId } = await params;

    const postAuthUser = await getAuthUser();
    if (!postAuthUser) return ApiErrors.unauthorized();

    const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
    if (!access) return ApiErrors.forbidden();

    const year = new Date().getFullYear();
    const result = await calculateBuildingCompliance(buildingId, year);
    return apiSuccess(result);
  } catch (error) {
    console.error('Compliance recalculation failed:', error);
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('locked') || msg.includes('not found')) {
      return apiError(msg, 409, 'CONFLICT');
    }
    return ApiErrors.internal('Recalculation failed');
  }
}
