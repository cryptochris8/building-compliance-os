import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users, organizations, orgInvitations } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getComplianceSummary } from "@/lib/emissions/compliance-service";
import type { PortfolioSummary } from "@/lib/emissions/types";
import { PortfolioDashboardClient } from "@/components/compliance/portfolio-dashboard-client";

async function ensureUserProvisioned(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if user exists in our DB
    const [dbUser] = await db.select({ organizationId: users.organizationId })
      .from(users).where(eq(users.id, user.id)).limit(1);

    if (dbUser?.organizationId) return dbUser.organizationId;

    // Honor a pending invitation before creating a brand-new org: if this
    // email address was invited to an organization, join that org instead.
    if (user.email) {
      const [invite] = await db
        .select({
          id: orgInvitations.id,
          organizationId: orgInvitations.organizationId,
          role: orgInvitations.role,
          expiresAt: orgInvitations.expiresAt,
        })
        .from(orgInvitations)
        .where(and(
          sql`lower(${orgInvitations.email}) = ${user.email.toLowerCase()}`,
          eq(orgInvitations.status, 'pending'),
        ))
        .limit(1);

      if (invite && new Date(invite.expiresAt) > new Date()) {
        const invitedName = user.user_metadata?.full_name || user.email.split('@')[0] || 'User';
        await db.transaction(async (tx) => {
          await tx.insert(users).values({
            id: user.id,
            email: user.email!,
            fullName: invitedName,
            organizationId: invite.organizationId,
            role: invite.role,
          }).onConflictDoUpdate({
            target: users.id,
            set: { organizationId: invite.organizationId, role: invite.role },
          });
          await tx.update(orgInvitations)
            .set({ status: 'accepted' })
            .where(eq(orgInvitations.id, invite.id));
        });
        return invite.organizationId;
      }
    }

    // Auto-provision: create org + user on first dashboard visit
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const result = await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({
        name: fullName + "'s Organization",
      }).returning();

      await tx.insert(users).values({
        id: user.id,
        email: user.email!,
        fullName,
        organizationId: org.id,
        role: 'owner',
      }).onConflictDoNothing();

      return org.id;
    });

    return result;
  } catch (err) {
    console.error('Failed to provision user:', err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function DashboardPage() {
  const orgId = await ensureUserProvisioned();
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
