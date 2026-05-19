import { NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ComplianceReportDocument } from "@/lib/reports/compliance-report";
import { assembleReportData } from "@/lib/reports/assemble-report-data";
import { getAuthUser, assertBuildingAccess } from "@/lib/auth/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import { checkAccess } from "@/lib/billing/feature-gate";
import { getReportWatermark } from "@/lib/billing/watermark";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";
import { apiSuccess, apiError, ApiErrors } from "@/lib/api/response";

const yearParamSchema = z.coerce.number().int().min(2000).max(2100);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const { buildingId } = await params;

    // Verify authentication BEFORE rate limiting so attackers cycling random
    // buildingIds cannot exhaust per-building buckets and DoS legitimate users.
    const authUser = await getAuthUser();
    if (!authUser) return ApiErrors.unauthorized();

    // Verify building ownership
    const access = await assertBuildingAccess(buildingId);
    if (!access) return ApiErrors.forbidden();

    // Rate limit: 10 report generations per minute per user
    const { success } = await apiLimiter.check(10, 'report:user:' + authUser.id);
    if (!success) return ApiErrors.tooManyRequests();

    // Enforce feature gate: report generation requires pro or portfolio tier
    const hasAccess = await checkAccess(access.orgId, 'reportGeneration');
    if (!hasAccess) {
      return apiError("Report generation requires a Pro or Portfolio plan. Please upgrade.", 403, 'FEATURE_GATED');
    }

    const url = new URL(request.url);
    const yearResult = yearParamSchema.safeParse(url.searchParams.get("year") || new Date().getFullYear());
    if (!yearResult.success) return ApiErrors.badRequest("Invalid year parameter");
    const year = yearResult.data;

    // Async mode: offload to Inngest background job (non-blocking)
    const asyncMode = url.searchParams.get("async") === "true";
    if (asyncMode) {
      const jobId = randomUUID();
      await inngest.send({
        name: "report/generate.requested",
        data: { buildingId, year, jobId, orgId: access.orgId },
      });
      return apiSuccess({ jobId, status: "processing", message: "Report generation started. The PDF will be available in Supabase Storage." }, 202);
    }

    // Synchronous mode: generate and stream PDF directly
    const result = await assembleReportData(buildingId, year);
    if (!result.data) {
      return ApiErrors.notFound("Compliance data");
    }

    // Trial subscriptions produce a watermarked, unfilable PDF; paid plans produce a clean one.
    const watermark = await getReportWatermark(access.orgId);

    const element = React.createElement(ComplianceReportDocument, { data: result.data, watermark });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element as any);

    const safeName = result.buildingName.replace(/[^a-zA-Z0-9]/g, "_");
    const prefix = watermark ? "TRIAL_" : "";
    const fileName = prefix + safeName + "_compliance_" + year + ".pdf";

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="' + fileName + '"',
      },
    });
  } catch (error) {
    console.error('Report generation failed:', error);
    return ApiErrors.internal("Report generation failed");
  }
}
