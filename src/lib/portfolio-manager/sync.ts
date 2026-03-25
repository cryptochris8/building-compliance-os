import { db } from "@/lib/db";
import {
  utilityAccounts,
  utilityReadings,
  pmConnections,
  pmPropertyMappings,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { PMClient } from "./client";
import { PM_METER_TYPE_MAP, PM_UNIT_MAP } from "./types";
import { decrypt } from "@/lib/auth/encryption";

/** Map PM meter type to local utility type */
export function mapPMToLocalUtilityType(pmMeterType: string): string {
  return PM_METER_TYPE_MAP[pmMeterType] || "electricity";
}

/** GJ to kBtu conversion factor */
const GJ_TO_KBTU = 947.817;

/** Map PM unit to local unit, applying conversion factor for GJ */
export function mapPMToLocalUnit(pmUnit: string): { unit: string; conversionFactor: number } {
  const mapped = PM_UNIT_MAP[pmUnit] || pmUnit;
  if (mapped === 'GJ') {
    return { unit: 'kbtu', conversionFactor: GJ_TO_KBTU };
  }
  return { unit: mapped.toLowerCase(), conversionFactor: 1 };
}

/** Fetch PM properties and create/update mapping records */
export async function syncProperties(orgId: string) {
  const [conn] = await db
    .select()
    .from(pmConnections)
    .where(eq(pmConnections.orgId, orgId))
    .limit(1);

  if (!conn) throw new Error("No PM connection found for organization");

  const client = new PMClient();
  client.setAuth(conn.pmUsername, decrypt(conn.pmPasswordEncrypted));

  const properties = await client.getProperties();

  for (const prop of properties) {
    if (prop.name && !prop.address) {
      try {
        const details = await client.getPropertyDetails(prop.id);
        if (details) {
          prop.address = details.address;
          prop.city = details.city;
          prop.state = details.state;
          prop.grossFloorArea = details.grossFloorArea;
          prop.yearBuilt = details.yearBuilt;
          prop.primaryFunction = details.primaryFunction;
        }
      } catch (err) {
        console.error('Failed to fetch PM property details for ' + prop.id + ':', err instanceof Error ? err.message : err);
      }
    }

    const existing = await db
      .select()
      .from(pmPropertyMappings)
      .where(
        and(
          eq(pmPropertyMappings.orgId, orgId),
          eq(pmPropertyMappings.pmPropertyId, prop.id)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(pmPropertyMappings).values({
        orgId,
        pmPropertyId: prop.id,
        pmPropertyName: prop.name,
      });
    } else {
      await db
        .update(pmPropertyMappings)
        .set({ pmPropertyName: prop.name })
        .where(eq(pmPropertyMappings.id, existing[0].id));
    }
  }

  await db
    .update(pmConnections)
    .set({ lastSyncAt: new Date() })
    .where(eq(pmConnections.id, conn.id));

  return properties;
}

type UtilityType = "electricity" | "natural_gas" | "district_steam" | "fuel_oil_2" | "fuel_oil_4";

/** Sync meter data from PM property to local readings */
export async function syncMeterData(
  buildingId: string,
  pmPropertyId: string,
  orgId: string
) {
  const [conn] = await db
    .select()
    .from(pmConnections)
    .where(eq(pmConnections.orgId, orgId))
    .limit(1);

  if (!conn) throw new Error("No PM connection found");

  const client = new PMClient();
  client.setAuth(conn.pmUsername, decrypt(conn.pmPasswordEncrypted));

  const meters = await client.getMeters(pmPropertyId);
  let importedCount = 0;

  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const startDate = new Date(now.getFullYear() - 2, 0, 1)
    .toISOString()
    .split("T")[0];

  const validTypes: UtilityType[] = [
    "electricity",
    "natural_gas",
    "district_steam",
    "fuel_oil_2",
    "fuel_oil_4",
  ];

  for (const meter of meters) {
    const localType = mapPMToLocalUtilityType(meter.type);
    if (!validTypes.includes(localType as UtilityType)) continue;

    const existingAccounts = await db
      .select()
      .from(utilityAccounts)
      .where(
        and(
          eq(utilityAccounts.buildingId, buildingId),
          eq(utilityAccounts.utilityType, localType as UtilityType)
        )
      )
      .limit(1);

    let accountId: string;
    if (existingAccounts.length > 0) {
      accountId = existingAccounts[0].id;
    } else {
      const [newAccount] = await db
        .insert(utilityAccounts)
        .values({
          buildingId,
          utilityType: localType as UtilityType,
          accountNumber: "PM Meter " + meter.id,
          providerName: "Portfolio Manager",
        })
        .returning();
      accountId = newAccount.id;
    }

    try {
      const consumptionData = await client.getMeterData(
        meter.id,
        startDate,
        endDate
      );

      for (const dataPoint of consumptionData) {
        if (!dataPoint.startDate || !dataPoint.endDate) continue;

        const { unit: localUnit, conversionFactor } = mapPMToLocalUnit(
          dataPoint.unit || meter.unitOfMeasure
        );
        const convertedUsage = dataPoint.usage * conversionFactor;

        try {
          await db.insert(utilityReadings).values({
            utilityAccountId: accountId,
            buildingId,
            periodStart: dataPoint.startDate,
            periodEnd: dataPoint.endDate,
            consumptionValue: String(convertedUsage),
            consumptionUnit: localUnit,
            costDollars: dataPoint.cost ? String(dataPoint.cost) : null,
            source: "portfolio_manager",
            confidence: "confirmed",
          });
          importedCount++;
        } catch (err) {
          // Expected: duplicate readings from unique constraint - log only unexpected errors
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('unique') && !msg.includes('duplicate')) {
            console.error('Failed to insert PM reading:', msg);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch meter data for meter:', err instanceof Error ? err.message : err);
    }
  }

  return { importedCount, metersCount: meters.length };
}
