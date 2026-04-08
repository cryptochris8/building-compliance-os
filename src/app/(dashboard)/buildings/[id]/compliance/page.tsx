import { db } from "@/lib/db";
import { buildings, complianceYears, utilityReadings, utilityAccounts, documents, complianceActivities } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { assertBuildingAccess } from "@/lib/auth/helpers";
import { getJurisdiction } from "@/lib/jurisdictions";
import { ComplianceDetailClient } from "@/components/compliance/compliance-detail-client";
import { ComplianceChecklist } from "@/components/compliance/compliance-checklist";
import { ActivityLog } from "@/components/compliance/activity-log";
import { ComplianceLockControls } from "@/components/compliance/compliance-lock-controls";

export default async function BuildingCompliancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const access = await assertBuildingAccess(id);
  if (!access) {
    notFound();
  }

  // First: get building (needed for existence check)
  const [building] = await db.select().from(buildings).where(eq(buildings.id, id)).limit(1);
  if (!building) return <div className="p-6">Building not found.</div>;

  // Then parallel: run independent queries concurrently
  const [allComplianceYears, accounts, readingsRaw, activities] = await Promise.all([
    db.select().from(complianceYears)
      .where(eq(complianceYears.buildingId, id)).orderBy(desc(complianceYears.year)),
    db.select({ id: utilityAccounts.id, utilityType: utilityAccounts.utilityType })
      .from(utilityAccounts).where(eq(utilityAccounts.buildingId, id)),
    db.select({
      id: utilityReadings.id,
      utilityAccountId: utilityReadings.utilityAccountId,
      periodStart: utilityReadings.periodStart,
      periodEnd: utilityReadings.periodEnd,
      consumptionValue: utilityReadings.consumptionValue,
      consumptionUnit: utilityReadings.consumptionUnit,
      confidence: utilityReadings.confidence,
    }).from(utilityReadings).where(eq(utilityReadings.buildingId, id)),
    db.select({
      id: complianceActivities.id,
      activityType: complianceActivities.activityType,
      description: complianceActivities.description,
      metadata: complianceActivities.metadata,
      createdAt: complianceActivities.createdAt,
      actorId: complianceActivities.actorId,
    }).from(complianceActivities)
      .where(eq(complianceActivities.buildingId, id))
      .orderBy(complianceActivities.createdAt),
  ]);

  const currentYear = new Date().getFullYear();
  const selectedYear = sp.year ? parseInt(sp.year) : (allComplianceYears[0]?.year || currentYear);

  // Sequential: depends on selectedYear from above
  const [complianceData] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, id), eq(complianceYears.year, selectedYear)))
    .limit(1);

  const accountTypeMap: Record<string, string> = {};
  for (const a of accounts) accountTypeMap[a.id] = a.utilityType;

  const yearStart = selectedYear + "-01-01";
  const yearEnd = selectedYear + "-12-31";

  const readingsForYear = readingsRaw
    .filter((r) => r.periodStart >= yearStart && r.periodEnd <= yearEnd)
    .map((r) => ({ ...r, utilityType: accountTypeMap[r.utilityAccountId] || "electricity" }));

  const availableYears = allComplianceYears.map((cy) => cy.year);
  if (!availableYears.includes(currentYear)) availableYears.unshift(currentYear);
  availableYears.sort((a, b) => b - a);

  // Checklist data
  const hasUtilityAccounts = accounts.length > 0;
  const hasEmissionsCalculated = complianceData ? Number(complianceData.totalEmissionsTco2e || 0) > 0 : false;
  const dataCompleteness = complianceData ? Number(complianceData.dataCompletenessPct || 0) : 0;

  // Check for compliance report and evidence documents (depends on complianceData)
  let hasComplianceReport = false;
  let hasEvidenceDocuments = false;
  if (complianceData) {
    const docs = await db.select({ documentType: documents.documentType }).from(documents)
      .where(eq(documents.complianceYearId, complianceData.id));
    hasComplianceReport = docs.some((d) => d.documentType === "compliance_report");
    hasEvidenceDocuments = docs.length > 0;
  }

  // Deductions
  let totalDeductions = 0;
  let netEmissions = 0;
  if (complianceData) {
    totalDeductions = Number(complianceData.totalDeductionsTco2e || 0);
    netEmissions = Number(complianceData.netEmissionsTco2e || 0);
  }

  const isLocked = complianceData?.locked || false;
  const checklistState = (complianceData?.checklistState as Record<string, boolean | string>) || null;

  // Derive penalty rate from jurisdiction config
  let penaltyPerTon = 268; // default NYC LL97
  try {
    const jurisdiction = getJurisdiction(building.jurisdictionId);
    const period = jurisdiction.periods.find(p => selectedYear >= p.startYear && selectedYear <= p.endYear);
    if (period) penaltyPerTon = period.penaltyPerTon;
  } catch { /* use default */ }

  return (
    <div className="space-y-6">
      <ComplianceDetailClient
        buildingId={id}
        buildingName={building.name}
        grossSqft={Number(building.grossSqft)}
        occupancyType={building.occupancyType}
        jurisdictionId={building.jurisdictionId}
        selectedYear={selectedYear}
        availableYears={availableYears}
        complianceData={complianceData ? {
          id: complianceData.id,
          status: complianceData.status || "incomplete",
          totalEmissions: Number(complianceData.totalEmissionsTco2e || 0),
          emissionsLimit: Number(complianceData.emissionsLimitTco2e || 0),
          emissionsOverLimit: Number(complianceData.emissionsOverLimit || 0),
          penalty: Number(complianceData.estimatedPenaltyDollars || 0),
          completeness: Number(complianceData.dataCompletenessPct || 0),
          missingMonths: (complianceData.missingMonths as string[]) || [],
        } : null}
        readings={readingsForYear}
        allComplianceYears={allComplianceYears.map((cy) => ({
          year: cy.year,
          emissions: Number(cy.totalEmissionsTco2e || 0),
          limit: Number(cy.emissionsLimitTco2e || 0),
        }))}
        penaltyPerTon={penaltyPerTon}
      />

      {/* Lock Controls */}
      <ComplianceLockControls
        buildingId={id}
        year={selectedYear}
        locked={isLocked}
        lockedAt={complianceData?.lockedAt ? new Date(complianceData.lockedAt).toISOString() : null}
      />

      {/* Deductions Summary */}
      {totalDeductions > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Gross Emissions</p>
            <p className="text-xl font-bold">{(Number(complianceData?.totalEmissionsTco2e || 0)).toFixed(2)} tCO2e</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Deductions</p>
            <p className="text-xl font-bold text-green-600">-{totalDeductions.toFixed(2)} tCO2e</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Net Emissions</p>
            <p className="text-xl font-bold">{netEmissions.toFixed(2)} tCO2e</p>
          </div>
        </div>
      )}

      {/* Checklist */}
      <ComplianceChecklist
        buildingId={id}
        year={selectedYear}
        dataCompletenessPct={dataCompleteness}
        hasUtilityAccounts={hasUtilityAccounts}
        hasEmissionsCalculated={hasEmissionsCalculated}
        hasComplianceReport={hasComplianceReport}
        hasEvidenceDocuments={hasEvidenceDocuments}
        checklistState={checklistState}
        locked={isLocked}
      />

      {/* Activity Log */}
      <ActivityLog activities={activities} buildingId={id} year={selectedYear} />
    </div>
  );
}
