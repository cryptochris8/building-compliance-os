import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BillingCard } from "@/components/settings/billing-card";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users, organizations, buildings } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { PLAN_CONFIGS, type PlanTier } from "@/lib/stripe/client";

async function getBillingInfo() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [dbUser] = await db.select({ organizationId: users.organizationId })
      .from(users).where(eq(users.id, user.id)).limit(1);
    if (!dbUser?.organizationId) return null;

    const [org] = await db.select({
      subscriptionTier: organizations.subscriptionTier,
    }).from(organizations).where(eq(organizations.id, dbUser.organizationId)).limit(1);

    const [buildingCount] = await db.select({ value: count() })
      .from(buildings).where(eq(buildings.organizationId, dbUser.organizationId));

    const tier = (org?.subscriptionTier as PlanTier) ?? "free";
    const plan = PLAN_CONFIGS[tier] ?? PLAN_CONFIGS.free;

    return {
      currentTier: tier,
      planName: plan.name,
      status: "active" as const,
      trialEnd: null as string | null,
      buildingCount: buildingCount?.value ?? 0,
      buildingLimit: plan.buildingLimit,
    };
  } catch (err) {
    console.error('Failed to load billing info:', err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function SettingsPage() {
  const billing = await getBillingInfo();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization settings, billing, and integrations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Manage organization details and members.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Organization settings will appear here.
            </p>
          </CardContent>
        </Card>
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
