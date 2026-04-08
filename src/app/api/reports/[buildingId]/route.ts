import { NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ComplianceReportDocument } from "@/lib/reports/compliance-report";
import { assembleReportData } from "@/lib/reports/assemble-report-data";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import { checkAccess } from "@/lib/billing/feature-gate";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";

const yearParamSchema = z.coerce.number().int().min(2000).max(2100);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const { buildingId } = await params;

    // Rate limit: 10 report generations per minute per building
    const { success } = await apiLimiter.check(10, 'report:' + buildingId);
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Verify building ownership
    const access = await assertBuildingAccess(buildingId);
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Enforce feature gate: report generation requires pro or portfolio tier
    const hasAccess = await checkAccess(access.orgId, 'reportGeneration');
    if (!hasAccess) {
      return NextResponse.json({ error: "Report generation requires a Pro or Portfolio plan. Please upgrade." }, { status: 403 });
    }

    const url = new URL(request.url);
    const yearResult = yearParamSchema.safeParse(url.searchParams.get("year") || new Date().getFullYear());
    if (!yearResult.success) {
      return NextResponse.json({ error: "Invalid year parameter" }, { status: 400 });
    }
    const year = yearResult.data;

    // Async mode: offload to Inngest background job (non-blocking)
    const asyncMode = url.searchParams.get("async") === "true";
    if (asyncMode) {
      const jobId = randomUUID();
      await inngest.send({
        name: "report/generate.requested",
        data: { buildingId, year, jobId },
      });
      return NextResponse.json({
        jobId,
        status: "processing",
        message: "Report generation started. The PDF will be available in Supabase Storage.",
      }, { status: 202 });
    }

    // Synchronous mode: generate and stream PDF directly
    const result = await assembleReportData(buildingId, year);
    if (!result.data) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    const element = React.createElement(ComplianceReportDocument, { data: result.data });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element as any);

    const safeName = result.buildingName.replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = safeName + "_compliance_" + year + ".pdf";

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="' + fileName + '"',
      },
    });
  } catch (error) {
    console.error('Report generation failed:', error);
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
