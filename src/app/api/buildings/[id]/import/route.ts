import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { parseCsv, validateCsvHeaders } from "@/lib/csv/parser";
import { assertBuildingAccess, WRITE_ROLES } from "@/lib/auth/helpers";
import { checkAccess } from "@/lib/billing/feature-gate";
import { apiLimiter } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { createServiceClient } from "@/lib/supabase/service";

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

    // Enforce feature gate: CSV upload requires pro or portfolio tier
    const hasAccess = await checkAccess(access.orgId, 'csvUpload');
    if (!hasAccess) {
      return NextResponse.json({ error: "CSV import requires a Pro or Portfolio plan. Please upgrade." }, { status: 403 });
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

    // Upload CSV content to Supabase Storage (avoids Inngest payload limits)
    const storagePath = "imports/" + buildingId + "/" + Date.now() + "-" + file.name;
    const supabase = createServiceClient();

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, csvText, {
        contentType: "text/csv",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: "Failed to store CSV file" }, { status: 500 });
    }

    // Create a pending import job
    const [job] = await db.insert(importJobs).values({
      organizationId: access.orgId,
      buildingId,
      fileName: file.name,
      filePath: storagePath,
      status: "processing",
      rowsTotal: parsed.rows.length,
    }).returning();

    // Send to Inngest — only pass the storage path, not the full CSV data
    await inngest.send({
      name: "csv/import.requested",
      data: {
        jobId: job.id,
        buildingId,
        storagePath,
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
    console.error('CSV import failed:', error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
