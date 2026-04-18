import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { parseCsv, validateCsvHeaders } from "@/lib/csv/parser";
import { getAuthUser, assertBuildingAccess, WRITE_ROLES } from "@/lib/auth/helpers";
import { checkAccess } from "@/lib/billing/feature-gate";
import { apiLimiter } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { createServiceClient } from "@/lib/supabase/service";
import { apiSuccess, apiError, ApiErrors } from "@/lib/api/response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: buildingId } = await params;

    const { success } = await apiLimiter.check(5, 'import:' + buildingId);
    if (!success) return ApiErrors.tooManyRequests();

    const authUser = await getAuthUser();
    if (!authUser) return ApiErrors.unauthorized();

    const access = await assertBuildingAccess(buildingId, WRITE_ROLES);
    if (!access) return ApiErrors.forbidden();

    const hasAccess = await checkAccess(access.orgId, 'csvUpload');
    if (!hasAccess) {
      return apiError("CSV import requires a Pro or Portfolio plan. Please upgrade.", 403, 'FEATURE_GATED');
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) return ApiErrors.badRequest("No file provided");
    if (!file.name.endsWith(".csv")) return ApiErrors.badRequest("Only CSV files are accepted");
    if (file.size > 10 * 1024 * 1024) return ApiErrors.badRequest("File size must be under 10MB");

    const csvText = await file.text();
    const parsed = parseCsv(csvText);

    const missingHeaders = validateCsvHeaders(parsed.headers);
    if (missingHeaders.length > 0) {
      return ApiErrors.badRequest("Missing required headers: " + missingHeaders.join(", "));
    }

    const storagePath = "imports/" + buildingId + "/" + Date.now() + "-" + file.name;
    const supabase = createServiceClient();

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, csvText, {
        contentType: "text/csv",
        upsert: true,
      });

    if (uploadError) return ApiErrors.internal("Failed to store CSV file");

    const [job] = await db.insert(importJobs).values({
      organizationId: access.orgId,
      buildingId,
      fileName: file.name,
      filePath: storagePath,
      status: "processing",
      rowsTotal: parsed.rows.length,
    }).returning();

    await inngest.send({
      name: "csv/import.requested",
      data: {
        jobId: job.id,
        buildingId,
        storagePath,
        parseErrors: parsed.errors,
      },
    });

    return apiSuccess({
      id: job.id,
      status: "processing",
      rowsTotal: parsed.rows.length,
      rowsImported: 0,
      rowsFailed: 0,
      fileName: file.name,
    });
  } catch (error) {
    console.error('CSV import failed:', error);
    return ApiErrors.internal("Import failed");
  }
}
