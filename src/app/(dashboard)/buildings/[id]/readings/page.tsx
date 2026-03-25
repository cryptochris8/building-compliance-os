import { db } from "@/lib/db";
import { utilityReadings, utilityAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import { ReadingsPageClient } from "./readings-client";

export default async function ReadingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: buildingId } = await params;

  const access = await assertBuildingAccess(buildingId);
  if (!access) redirect("/buildings");

  // Fetch utility accounts for this building
  const accounts = await db
    .select({
      id: utilityAccounts.id,
      utilityType: utilityAccounts.utilityType,
    })
    .from(utilityAccounts)
    .where(eq(utilityAccounts.buildingId, buildingId));

  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.utilityType]));

  // Fetch all readings for this building
  const rawReadings = await db
    .select({
      id: utilityReadings.id,
      utilityAccountId: utilityReadings.utilityAccountId,
      periodStart: utilityReadings.periodStart,
      periodEnd: utilityReadings.periodEnd,
      consumptionValue: utilityReadings.consumptionValue,
      consumptionUnit: utilityReadings.consumptionUnit,
      costDollars: utilityReadings.costDollars,
      source: utilityReadings.source,
      confidence: utilityReadings.confidence,
    })
    .from(utilityReadings)
    .where(eq(utilityReadings.buildingId, buildingId));

  const readings = rawReadings.map((r) => ({
    id: r.id,
    utilityAccountId: r.utilityAccountId,
    utilityType: accountTypeMap.get(r.utilityAccountId) || "electricity",
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    consumptionValue: r.consumptionValue,
    consumptionUnit: r.consumptionUnit,
    costDollars: r.costDollars ?? null,
    source: r.source,
    confidence: r.confidence ?? "confirmed",
  }));

  return <ReadingsPageClient buildingId={buildingId} readings={readings} />;
}
