import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status: {
    status: 'ok' | 'degraded';
    timestamp: string;
    checks: Record<string, { status: 'pass' | 'fail'; latencyMs?: number; error?: string }>;
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // Database connectivity check
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    status.checks.database = { status: 'pass', latencyMs: Date.now() - start };
  } catch (error) {
    status.status = 'degraded';
    status.checks.database = {
      status: 'fail',
      error: 'Database connection failed',
    };
  }

  const httpStatus = status.status === 'ok' ? 200 : 503;
  return NextResponse.json(status, { status: httpStatus });
}
