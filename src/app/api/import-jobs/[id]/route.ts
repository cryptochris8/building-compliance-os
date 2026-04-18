import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserOrgId } from "@/lib/auth/helpers";
import { apiSuccess, ApiErrors } from "@/lib/api/response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const orgId = await getUserOrgId();
    if (!orgId) return ApiErrors.unauthorized();

    const jobs = await db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.organizationId, orgId)));

    if (jobs.length === 0) return ApiErrors.notFound('Import job');

    const job = jobs[0];

    return apiSuccess({
      id: job.id,
      status: job.status,
      fileName: job.fileName,
      rowsTotal: job.rowsTotal,
      rowsImported: job.rowsImported,
      rowsFailed: job.rowsFailed,
      errorLog: job.errorLog,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    console.error('Import job lookup failed:', error);
    return ApiErrors.internal("Failed to get import job");
  }
}
