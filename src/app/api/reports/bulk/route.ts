import { NextResponse } from "next/server";
import { z } from "zod";
import { filterAuthorizedBuildingIds, getAuthContext } from "@/lib/auth/helpers";
import { checkAccess } from "@/lib/billing/feature-gate";

const bulkReportSchema = z.object({
  buildingIds: z.array(z.string().uuid()).min(1, "At least one building ID required"),
  year: z.number().int().min(2000).max(2100),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = bulkReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
    }
    const { buildingIds, year } = parsed.data;

    const auth = await filterAuthorizedBuildingIds(buildingIds);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Enforce feature gate: bulk operations require portfolio tier
    const hasBulkAccess = await checkAccess(auth.orgId, 'bulkOperations');
    if (!hasBulkAccess) {
      return NextResponse.json({ error: "Bulk operations require a Portfolio plan. Please upgrade." }, { status: 403 });
    }

    const results: Array<{ buildingId: string; url: string }> = [];
    for (const buildingId of auth.authorizedIds) {
      results.push({ buildingId, url: "/api/reports/" + buildingId + "?year=" + year });
    }
    return NextResponse.json({ reports: results, year });
  } catch (error) {
    console.error('Bulk report generation failed:', error);
    return NextResponse.json({ error: "Bulk report generation failed" }, { status: 500 });
  }
}
