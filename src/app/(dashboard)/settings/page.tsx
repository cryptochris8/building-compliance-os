import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BillingCard } from "@/components/settings/billing-card";
import { OrgMembers } from "@/components/settings/org-members";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users, organizations, buildings, subscriptions, orgInvitations } from "@/lib/db/schema";
import { eq, and, count, desc } from "drizzle-orm";
import { PLAN_CONFIGS, type PlanTier } from "@/lib/stripe/client";

async function getBillingInfo() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [dbUser] = await db.select({ organizationId: users.organizationId })
      .from(users).where(eq(users.id, user.id)).limit(1);
    if (!dbUser?.organizationId) return null;

    const [org, buildingCount, latestSub] = await Promise.all([
      db.select({ subscriptionTier: organizations.subscriptionTier })
        .from(organizations).where(eq(organizations.id, dbUser.organizationId)).then(r => r[0]),
      db.select({ value: count() })
        .from(buildings).where(eq(buildings.organizationId, dbUser.organizationId)).then(r => r[0]),
      db.select({ status: subscriptions.status, trialEnd: subscriptions.trialEnd })
        .from(subscriptions).where(eq(subscriptions.orgId, dbUser.organizationId))
        .orderBy(desc(subscriptions.createdAt)).limit(1).then(r => r[0]),
    ]);

    const tier = (org?.subscriptionTier as PlanTier) ?? "free";
    const plan = PLAN_CONFIGS[tier] ?? PLAN_CONFIGS.free;

    // Use actual subscription status; default to "active" for free tier (no subscription record)
    const status = latestSub?.status ?? "active";
    const trialEnd = latestSub?.trialEnd?.toISOString() ?? null;

    return {
      currentTier: tier,
      planName: plan.name,
      status: status as "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid",
      trialEnd,
      buildingCount: buildingCount?.value ?? 0,
      buildingLimit: plan.buildingLimit,
    };
  } catch (err) {
    console.error('Failed to load billing info:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function getOrgMembersData(userId: string, orgId: string) {
  try {
    const [membersList, invitationsList, currentUser] = await Promise.all([
      db.select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.organizationId, orgId)),
      db.select({
        id: orgInvitations.id,
        email: orgInvitations.email,
        role: orgInvitations.role,
        status: orgInvitations.status,
        expiresAt: orgInvitations.expiresAt,
        createdAt: orgInvitations.createdAt,
      }).from(orgInvitations).where(
        and(eq(orgInvitations.organizationId, orgId), eq(orgInvitations.status, 'pending'))
      ),
      db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1).then(r => r[0]),
    ]);

    return {
      members: membersList,
      invitations: invitationsList,
      currentUserId: userId,
      currentUserRole: currentUser?.role || 'member',
    };
  } catch (err) {
    console.error('Failed to load org members:', err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function SettingsPage() {
  const billing = await getBillingInfo();

  // Load member data if we have a logged-in user with an org
  let membersData = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [dbUser] = await db.select({ organizationId: users.organizationId })
        .from(users).where(eq(users.id, user.id)).limit(1);
      if (dbUser?.organizationId) {
        membersData = await getOrgMembersData(user.id, dbUser.organizationId);
      }
    }
  } catch {
    // silently fall through — member card will show placeholder
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization settings, billing, and integrations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {membersData ? (
          <OrgMembers
            members={membersData.members}
            invitations={membersData.invitations}
            currentUserId={membersData.currentUserId}
            currentUserRole={membersData.currentUserRole}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
              <CardDescription>Manage organization details and members.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Sign in to manage organization members.
              </p>
            </CardContent>
          </Card>
        )}
        <Link href="/settings/portfolio-manager">
          <Card className="hover:border-primary transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle>Portfolio Manager</CardTitle>
              <CardDescription>Connect your EPA ENERGY STAR Portfolio Manager account.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Import building data and utility readings from Portfolio Manager.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4">Billing &amp; Subscription</h3>
        {billing ? (
          <BillingCard
            currentTier={billing.currentTier}
            planName={billing.planName}
            status={billing.status}
            trialEnd={billing.trialEnd}
            buildingCount={billing.buildingCount}
            buildingLimit={billing.buildingLimit}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Sign in to manage your billing and subscription.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
