import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { buildingIds, year } = await request.json();
    if (!buildingIds || !Array.isArray(buildingIds) || !year)
      return NextResponse.json({ error: "buildingIds and year required" }, { status: 400 });

    const results: Array<{ buildingId: string; url: string }> = [];
    for (const buildingId of buildingIds) {
      results.push({ buildingId, url: "/api/reports/" + buildingId + "?year=" + year });
    }
    return NextResponse.json({ reports: results, year });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk report generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
