import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { parseCsv, validateCsvHeaders } from "@/lib/csv/parser";
import { assertBuildingAccess, type UserRole } from "@/lib/auth/helpers";

const WRITE_ROLES: UserRole[] = ['owner', 'admin'];
import { apiLimiter } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: buildingId } = await params;

    // Rate limit: 5 imports per minute per building
    const { success } = await apiLimiter.check(5, 'import:' + buildingId);
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Verify building ownership and write permission
    const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are accepted" }, { status: 400 });
    }

    // Enforce file size limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be under 10MB" }, { status: 400 });
    }

    const csvText = await file.text();
    const parsed = parseCsv(csvText);

    // Validate headers
    const missingHeaders = validateCsvHeaders(parsed.headers);
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: "Missing required headers: " + missingHeaders.join(", ") },
        { status: 400 }
      );
    }

    // Create a pending import job
    const [job] = await db.insert(importJobs).values({
      organizationId: access.orgId,
      buildingId,
      fileName: file.name,
      filePath: "imports/" + buildingId + "/" + Date.now() + "-" + file.name,
      status: "processing",
      rowsTotal: parsed.rows.length,
    }).returning();

    // Send to Inngest for background processing
    await inngest.send({
      name: "csv/import.requested",
      data: {
        jobId: job.id,
        buildingId,
        rows: parsed.rows,
        parseErrors: parsed.errors,
      },
    });

    return NextResponse.json({
      id: job.id,
      status: "processing",
      rowsTotal: parsed.rows.length,
      rowsImported: 0,
      rowsFailed: 0,
      fileName: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
