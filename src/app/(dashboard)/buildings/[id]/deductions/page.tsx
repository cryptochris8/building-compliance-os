import { db } from "@/lib/db";
import { buildings, complianceYears, deductions, documents } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { DeductionsClient } from "@/components/compliance/deductions-client";

export default async function DeductionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [building] = await db.select().from(buildings).where(eq(buildings.id, id)).limit(1);
  if (!building) return <div className="p-6">Building not found.</div>;

  const allCY = await db.select().from(complianceYears)
    .where(eq(complianceYears.buildingId, id)).orderBy(desc(complianceYears.year));

  const currentYear = new Date().getFullYear();
  const selectedYear = sp.year ? parseInt(sp.year) : (allCY[0]?.year || currentYear);

  const [cy] = await db.select().from(complianceYears)
    .where(and(eq(complianceYears.buildingId, id), eq(complianceYears.year, selectedYear)))
    .limit(1);

  let deductionsList: Array<{
    id: string;
    deductionType: string;
    description: string | null;
    amountTco2e: string;
    verified: boolean | null;
    createdAt: Date | null;
  }> = [];

  if (cy) {
    const raw = await db.select().from(deductions).where(eq(deductions.complianceYearId, cy.id));
    deductionsList = raw.map((d) => ({
      id: d.id,
      deductionType: d.deductionType,
      description: d.description,
      amountTco2e: d.amountTco2e,
      verified: d.verified,
      createdAt: d.createdAt,
    }));
  }

  const availableYears = allCY.map((c) => c.year);
  if (!availableYears.includes(currentYear)) availableYears.unshift(currentYear);
  availableYears.sort((a, b) => b - a);

  return (
    <DeductionsClient
      buildingId={id}
      buildingName={building.name}
      selectedYear={selectedYear}
      availableYears={availableYears}
      complianceYearId={cy?.id || null}
      totalEmissions={cy ? Number(cy.totalEmissionsTco2e || 0) : 0}
      totalDeductions={cy ? Number(cy.totalDeductionsTco2e || 0) : 0}
      netEmissions={cy ? Number(cy.netEmissionsTco2e || 0) : 0}
      emissionsLimit={cy ? Number(cy.emissionsLimitTco2e || 0) : 0}
      deductions={deductionsList}
      locked={cy?.locked || false}
    />
  );
}
