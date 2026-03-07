import { NextResponse } from "next/server";
import { z } from "zod";
import { filterAuthorizedBuildingIds } from "@/lib/auth/helpers";

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

    const results: Array<{ buildingId: string; url: string }> = [];
    for (const buildingId of auth.authorizedIds) {
      results.push({ buildingId, url: "/api/reports/" + buildingId + "?year=" + year });
    }
    return NextResponse.json({ reports: results, year });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk report generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
