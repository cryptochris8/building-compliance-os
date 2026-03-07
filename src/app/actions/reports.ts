"use server";

import { db } from "@/lib/db";
import { buildings, complianceYears } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthUser, assertBuildingAccess, getUserOrgId } from "@/lib/auth/helpers";

export async function getReportHistory(buildingId: string) {
  const authUser = await getAuthUser();
  if (!authUser) return [];

  // Verify building ownership
  const access = await assertBuildingAccess(buildingId);
  if (!access) return [];

  const years = await db.select({
    id: complianceYears.id,
    year: complianceYears.year,
    status: complianceYears.status,
    totalEmissions: complianceYears.totalEmissionsTco2e,
    emissionsLimit: complianceYears.emissionsLimitTco2e,
    penalty: complianceYears.estimatedPenaltyDollars,
    completeness: complianceYears.dataCompletenessPct,
    reportSubmitted: complianceYears.reportSubmitted,
    reportSubmittedAt: complianceYears.reportSubmittedAt,
  }).from(complianceYears)
    .where(eq(complianceYears.buildingId, buildingId))
    .orderBy(desc(complianceYears.year));

  return years;
}

export async function getAvailableYears(buildingId: string) {
  const authUser = await getAuthUser();
  if (!authUser) return [];

  // Verify building ownership
  const access = await assertBuildingAccess(buildingId);
  if (!access) return [];

  const years = await db.select({ year: complianceYears.year })
    .from(complianceYears)
    .where(eq(complianceYears.buildingId, buildingId))
    .orderBy(desc(complianceYears.year));

  return years.map((y) => y.year);
}

export async function markReportSubmitted(buildingId: string, year: number) {
  const authUser = await getAuthUser();
  if (!authUser) return { error: "Unauthorized" };

  // Verify building ownership
  const access = await assertBuildingAccess(buildingId);
  if (!access) return { error: "Building not found or access denied" };

  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, buildingId), eq(complianceYears.year, year)))
    .limit(1);

  if (!cy) return { error: "Compliance year not found" };
  if (cy.locked) return { error: "Compliance year is locked" };

  await db.update(complianceYears).set({
    reportSubmitted: true,
    reportSubmittedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(complianceYears.id, cy.id));

  return { success: true };
}

export async function getPortfolioBuildings() {
  const orgId = await getUserOrgId();
  if (!orgId) return [];

  const orgBuildings = await db.select({
    id: buildings.id,
    name: buildings.name,
    addressLine1: buildings.addressLine1,
    city: buildings.city,
    state: buildings.state,
  }).from(buildings).where(eq(buildings.organizationId, orgId));

  return orgBuildings;
}
