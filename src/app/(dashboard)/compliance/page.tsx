import { db } from "@/lib/db";
import { buildings, complianceYears, users } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getJurisdiction } from "@/lib/jurisdictions";
import { ComplianceCalendarClient } from "@/components/compliance/compliance-calendar-client";

async function getUserOrgId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [dbUser] = await db.select({ organizationId: users.organizationId })
    .from(users).where(eq(users.id, user.id)).limit(1);
  return dbUser?.organizationId || null;
}

export interface ComplianceDeadlineRow {
  buildingId: string;
  buildingName: string;
  jurisdiction: string;
  jurisdictionName: string;
  year: number;
  reportDueDate: string;
  status: string;
  daysUntilDue: number;
  reportSubmitted: boolean;
  locked: boolean;
}

export default async function CompliancePage() {
  const orgId = await getUserOrgId();

  const deadlines: ComplianceDeadlineRow[] = [];

  if (orgId) {
    const orgBuildings = await db.select({
      id: buildings.id,
      name: buildings.name,
      jurisdictionId: buildings.jurisdictionId,
    }).from(buildings).where(eq(buildings.organizationId, orgId));

    if (orgBuildings.length > 0) {
      // Batch query: fetch all compliance years for all buildings in one query
      const buildingIds = orgBuildings.map(b => b.id);
      const allCyRecords = await db.select().from(complianceYears)
        .where(inArray(complianceYears.buildingId, buildingIds))
        .orderBy(desc(complianceYears.year));

      // Group by building
      const cyByBuilding = new Map<string, typeof allCyRecords>();
      for (const cy of allCyRecords) {
        const existing = cyByBuilding.get(cy.buildingId) || [];
        existing.push(cy);
        cyByBuilding.set(cy.buildingId, existing);
      }

      const now = new Date();

      for (const building of orgBuildings) {
        const cyRecords = cyByBuilding.get(building.id) || [];

        for (const cy of cyRecords) {
          let dueDate: Date;
          if (cy.reportDueDate) {
            dueDate = new Date(cy.reportDueDate);
          } else {
            const jurisdiction = getJurisdiction(building.jurisdictionId);
            dueDate = new Date(cy.year + 1, jurisdiction.reportingDeadline.month - 1, jurisdiction.reportingDeadline.day);
          }

          const diffMs = dueDate.getTime() - now.getTime();
          const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const jurisdictionConfig = getJurisdiction(building.jurisdictionId);

          deadlines.push({
            buildingId: building.id,
            buildingName: building.name,
            jurisdiction: building.jurisdictionId,
            jurisdictionName: jurisdictionConfig.name,
            year: cy.year,
            reportDueDate: dueDate.toISOString().split('T')[0],
            status: cy.status || 'incomplete',
            daysUntilDue: daysUntil,
            reportSubmitted: cy.reportSubmitted || false,
            locked: cy.locked || false,
          });
        }
      }
    }
  }

  deadlines.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Compliance Calendar</h2>
        <p className="text-muted-foreground">
          Track compliance deadlines and status across all buildings.
        </p>
      </div>
      <ComplianceCalendarClient deadlines={deadlines} />
    </div>
  );
}
