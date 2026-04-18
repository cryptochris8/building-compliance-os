import { z } from "zod";
import { getAuthUser, filterAuthorizedBuildingIds } from "@/lib/auth/helpers";
import { checkAccess } from "@/lib/billing/feature-gate";
import { apiSuccess, apiError, ApiErrors } from "@/lib/api/response";

const bulkReportSchema = z.object({
  buildingIds: z.array(z.string().uuid()).min(1, "At least one building ID required"),
  year: z.number().int().min(2000).max(2100),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = bulkReportSchema.safeParse(body);
    if (!parsed.success) {
      return ApiErrors.badRequest(parsed.error.issues[0]?.message || "Invalid request");
    }
    const { buildingIds, year } = parsed.data;

    const authUser = await getAuthUser();
    if (!authUser) return ApiErrors.unauthorized();

    const auth = await filterAuthorizedBuildingIds(buildingIds);
    if (!auth) return ApiErrors.forbidden();

    const hasBulkAccess = await checkAccess(auth.orgId, 'bulkOperations');
    if (!hasBulkAccess) {
      return apiError("Bulk operations require a Portfolio plan. Please upgrade.", 403, 'FEATURE_GATED');
    }

    const results: Array<{ buildingId: string; url: string }> = [];
    for (const buildingId of auth.authorizedIds) {
      results.push({ buildingId, url: "/api/reports/" + buildingId + "?year=" + year });
    }
    return apiSuccess({ reports: results, year });
  } catch (error) {
    console.error('Bulk report generation failed:', error);
    return ApiErrors.internal("Bulk report generation failed");
  }
}
