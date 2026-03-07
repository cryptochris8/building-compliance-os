import { NextResponse } from "next/server";
import { filterAuthorizedBuildingIds } from "@/lib/auth/helpers";

export async function POST(request: Request) {
  try {
    // Verify building ownership for all requested IDs
    const { buildingIds, year } = await request.json();
    if (!buildingIds || !Array.isArray(buildingIds) || !year)
      return NextResponse.json({ error: "buildingIds and year required" }, { status: 400 });

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
