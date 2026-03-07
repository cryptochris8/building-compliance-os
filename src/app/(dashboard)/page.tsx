import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getComplianceSummary } from "@/lib/emissions/compliance-service";
import type { PortfolioSummary } from "@/lib/emissions/types";
import { PortfolioDashboardClient } from "@/components/compliance/portfolio-dashboard-client";

async function getOrgId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const [dbUser] = await db.select({ organizationId: users.organizationId })
      .from(users).where(eq(users.id, user.id)).limit(1);
    return dbUser?.organizationId || null;
  } catch (err) {
    console.error('Failed to get org ID:', err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function DashboardIndex() {
  const orgId = await getOrgId();
  const currentYear = new Date().getFullYear();

  let summary: PortfolioSummary | null = null;
  if (orgId) {
    try {
      summary = await getComplianceSummary(orgId, currentYear);
    } catch (err) {
      console.error('Failed to load compliance summary:', err instanceof Error ? err.message : err);
    }
  }

  return (
    <PortfolioDashboardClient
      summary={summary}
      year={currentYear}
    />
  );
}
