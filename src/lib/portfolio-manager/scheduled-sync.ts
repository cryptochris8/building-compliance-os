import { db } from "@/lib/db";
import { pmConnections, pmPropertyMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncProperties, syncMeterData } from "./sync";
import { inngest } from "@/lib/inngest/client";

export const monthlyPMSync = inngest.createFunction(
  { id: "monthly-pm-sync" },
  { cron: "0 0 1 * *" },
  async () => {
    console.log("[PM Sync] Starting monthly Portfolio Manager sync...");

    const connections = await db.select().from(pmConnections);

    for (const conn of connections) {
      console.log("[PM Sync] Syncing org " + conn.orgId + "...");

      try {
        const properties = await syncProperties(conn.orgId);
        console.log(
          "[PM Sync] Found " + properties.length + " properties for org " + conn.orgId
        );

        const linkedMappings = await db
          .select()
          .from(pmPropertyMappings)
          .where(eq(pmPropertyMappings.orgId, conn.orgId));

        for (const mapping of linkedMappings) {
          if (!mapping.buildingId) continue;

          try {
            const result = await syncMeterData(
              mapping.buildingId,
              mapping.pmPropertyId,
              conn.orgId
            );
            console.log(
              "[PM Sync] Imported " +
                result.importedCount +
                " readings for building " +
                mapping.buildingId
            );
          } catch (error) {
            console.error(
              "[PM Sync] Failed to sync meter data for building " +
                mapping.buildingId,
              error
            );
          }
        }
      } catch (error) {
        console.error("[PM Sync] Failed to sync org " + conn.orgId, error);
      }
    }

    console.log("[PM Sync] Monthly sync complete.");
  }
);
