import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobs = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, id));

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
    const message = error instanceof Error ? error.message : "Failed to get import job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
