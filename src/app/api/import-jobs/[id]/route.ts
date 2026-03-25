import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserOrgId } from "@/lib/auth/helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify user is authenticated and get their org
    const orgId = await getUserOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only return jobs belonging to the user's organization
    const jobs = await db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.organizationId, orgId)));

    if (jobs.length === 0) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 });
    }

    const job = jobs[0];

    return NextResponse.json({
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
    return NextResponse.json({ error: "Failed to get import job" }, { status: 500 });
  }
}
